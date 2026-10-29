#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classify, isSafePath, parseArgs, readJson, testPathFor } from './lib.mjs';

export function parseNameStatus(raw) {
  const parts = raw.split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index < parts.length;) {
    const status = parts[index++];
    if (/^[RC]/.test(status)) entries.push({ status: status[0], previous: parts[index++], path: parts[index++] });
    else entries.push({ status: status[0], path: parts[index++] });
  }
  return entries;
}

export function buildManifest(entries, { exists = existsSync, maxFiles = 25 } = {}) {
  const manifest = { packages: {}, skipped: [], deletedSources: [], changedTests: [], truncated: false };
  let sourceCount = 0;
  for (const entry of entries) {
    if (!isSafePath(entry.path)) {
      manifest.skipped.push({ path: entry.path, reason: 'unsupported path' });
      continue;
    }
    const info = classify(entry.path);
    if (entry.status === 'D') {
      if (info.kind === 'source') manifest.deletedSources.push({ path: entry.path, testFile: testPathFor(entry.path) });
      else manifest.skipped.push({ path: entry.path, reason: 'deleted' });
      continue;
    }
    if (info.kind === 'test' || info.kind === 'test-support') {
      manifest.changedTests.push(entry.path);
      continue;
    }
    if (info.kind !== 'source') {
      manifest.skipped.push({ path: entry.path, reason: info.reason });
      continue;
    }
    if (sourceCount >= maxFiles) {
      manifest.truncated = true;
      manifest.skipped.push({ path: entry.path, reason: `over the ${maxFiles}-file limit for one run` });
      continue;
    }
    sourceCount++;
    // Hooks that render JSX in their tests use .test.tsx
    const expected = testPathFor(entry.path);
    const testFile = [expected, expected?.replace(/.test.ts$/, '.test.tsx')].find((file) => file && exists(file)) ?? expected;
    (manifest.packages[info.package] ??= []).push({
      path: entry.path,
      status: { A: 'added', M: 'modified', R: 'renamed', C: 'copied', T: 'modified' }[entry.status] ?? 'modified',
      ...(entry.previous ? { previous: entry.previous } : {}),
      testFile,
      testExists: exists(testFile),
    });
  }
  manifest.hasTestableChanges = sourceCount > 0 || manifest.deletedSources.length > 0;
  return manifest;
}

export function coverageGaps(entry) {
  const lines = new Set(Object.entries(entry.s ?? {}).filter(([, hits]) => hits === 0).map(([id]) => entry.statementMap[id].start.line));
  const branches = new Set(Object.entries(entry.b ?? {}).filter(([, hits]) => hits.some((count) => count === 0)).map(([id]) => entry.branchMap[id].loc?.start.line ?? entry.branchMap[id].locations[0].start.line));
  const functions = Object.entries(entry.f ?? {}).filter(([, hits]) => hits === 0).map(([id]) => entry.fnMap[id].name);
  const sorted = (set) => [...set].sort((a, b) => a - b);
  return { lines: sorted(lines), branches: sorted(branches), functions };
}

export function buildCoverageManifest(reports, { exists = existsSync, maxFiles = 25 } = {}) {
  const manifest = { mode: 'coverage', packages: {}, skipped: [], deletedSources: [], changedTests: [], truncated: false };
  let sourceCount = 0;
  for (const [name, report] of Object.entries(reports)) {
    for (const entry of Object.values(report ?? {})) {
      const absolute = String(entry.path ?? '').replaceAll('\\', '/');
      const index = absolute.lastIndexOf(`/${name}/src/`);
      if (index === -1) continue;
      const file = absolute.slice(index + 1);
      const gaps = coverageGaps(entry);
      if (!gaps.lines.length && !gaps.branches.length && !gaps.functions.length) continue;
      if (!isSafePath(file) || classify(file).kind !== 'source') {
        manifest.skipped.push({ path: file, reason: classify(file).reason ?? 'unsupported path' });
        continue;
      }
      if (sourceCount >= maxFiles) {
        manifest.truncated = true;
        manifest.skipped.push({ path: file, reason: `over the ${maxFiles}-file limit for one run` });
        continue;
      }
      sourceCount++;
      const expected = testPathFor(file);
      const testFile = [expected, expected?.replace(/.test.ts$/, '.test.tsx')].find((candidate) => candidate && exists(candidate)) ?? expected;
      (manifest.packages[name] ??= []).push({ path: file, status: 'uncovered', testFile, testExists: exists(testFile), gaps });
    }
    manifest.packages[name]?.sort((a, b) => a.path.localeCompare(b.path));
  }
  manifest.hasTestableChanges = sourceCount > 0;
  return manifest;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.coverage) {
    const reports = Object.fromEntries(String(args.coverage).split(',').map((pair) => pair.split('=')).map(([name, file]) => [name, readJson(file, {})]));
    const json = JSON.stringify(buildCoverageManifest(reports, { maxFiles: Number(args['max-files'] ?? 25) }), null, 2);
    if (args.out) writeFileSync(args.out, `${json}\n`);
    else process.stdout.write(`${json}\n`);
    return;
  }
  if (!args.base || !args.head) throw new Error('--base and --head are required');
  for (const ref of [args.base, args.head]) {
    if (!/^[0-9a-f]{7,40}$/i.test(ref)) throw new Error(`Expected a commit SHA, got: ${ref}`);
  }
  const raw = execFileSync('git', ['diff', '--name-status', '-z', '-M', '--no-color', `${args.base}...${args.head}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const manifest = { base: args.base, head: args.head, ...buildManifest(parseNameStatus(raw), { maxFiles: Number(args['max-files'] ?? 25) }) };
  const json = JSON.stringify(manifest, null, 2);
  if (args.out) writeFileSync(args.out, `${json}\n`);
  else process.stdout.write(`${json}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
