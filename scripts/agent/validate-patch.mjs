#!/usr/bin/env node
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isTestPath, parseArgs, readJson } from './lib.mjs';

export const LIMITS = { bytes: 300_000, files: 30 };

// Test code that passes without checking anything or reaches outside the unit
export const CONTENT_RULES = [
  [/\b(?:it|test|describe|suite)\s*\.\s*(?:only|skip|todo|fails|skipIf|runIf)\b/, 'focused, skipped or inverted tests are not allowed'],
  [/(?:^|[^\w.])(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/, 'focused or skipped tests are not allowed'],
  [/\b(?:ctx|context)\s*\.\s*skip\s*\(/, 'skipping from inside a test is not allowed'],
  [/\.toMatch(?:Inline|File)?Snapshot\b|\.toThrowErrorMatching(?:Inline)?Snapshot\b/, 'snapshot assertions are not allowed; assert the behaviour'],
  [/\bprocess\.env(?:\.\w+|\[[^\]]+\])?\s*(?:\?\?|\|\|)?=(?!=)|\bdelete\s+process\.env\b/, 'change environment variables with vi.stubEnv, which is undone after each test'],
  [/(?:from|import|require)\s*\(?\s*['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads)['"]/, 'network and process modules are not allowed in unit tests'],
  [/(?:from|import|require)\s*\(?\s*['"](?:undici|axios|node-fetch|ws)['"]/, 'network clients are not allowed in unit tests'],
  [/\bprocess\.exit\s*\(/, 'process.exit is not allowed in tests'],
];

export function contentErrors(file, added) {
  const errors = [];
  for (const line of added) {
    const code = line.replace(/\/\/.*$/, '');
    for (const [pattern, message] of CONTENT_RULES) {
      if (pattern.test(code)) errors.push(`${file}: ${message} (\`${line.trim().slice(0, 120)}\`).`);
    }
  }
  return errors;
}

export function parsePatch(text) {
  const files = [];
  let current = null;
  let inHunk = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Unparsable headers keep the raw line, so isTestPath rejects them
      const header = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line);
      current = { from: header?.[1] ?? line, to: header?.[2] ?? line, operation: 'modify', binary: false, mode: null, added: [] };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('@@')) { inHunk = true; continue; }
    if (inHunk) {
      if (line.startsWith('+')) current.added.push(line.slice(1));
      continue;
    }
    if (line.startsWith('new file mode ')) { current.operation = 'create'; current.mode = line.slice(14); }
    else if (line.startsWith('deleted file mode ')) { current.operation = 'delete'; current.mode = line.slice(18); }
    else if (line.startsWith('new mode ')) current.mode = line.slice(9);
    else if (line.startsWith('rename from ')) current.operation = 'rename';
    else if (line.startsWith('copy from ')) current.operation = 'copy';
    else if (line.startsWith('Binary files ') || line === 'GIT binary patch') current.binary = true;
  }
  return files;
}

export function validatePatch(text, manifest = {}) {
  const errors = [];
  if (Buffer.byteLength(text) > LIMITS.bytes) errors.push(`Patch is larger than ${LIMITS.bytes} bytes.`);
  if (text.trim() && !text.startsWith('diff --git ')) errors.push('Patch does not start with a git diff header.');
  const files = parsePatch(text);
  if (files.length > LIMITS.files) errors.push(`Patch touches ${files.length} files (limit ${LIMITS.files}).`);
  // A test can only be deleted together with its source
  const deletable = new Set((manifest.deletedSources ?? []).map((entry) => entry.testFile));
  for (const file of files) {
    for (const target of new Set([file.from, file.to])) {
      if (!isTestPath(target)) errors.push(`${target}: only test files and test helpers may be changed.`);
    }
    if (file.binary) errors.push(`${file.to}: binary changes are not allowed.`);
    if (file.mode && file.mode !== '100644') errors.push(`${file.to}: file mode ${file.mode} is not allowed (no executables or symlinks).`);
    if (file.operation === 'delete' && !deletable.has(file.from)) errors.push(`${file.from}: deleting a test is only allowed when its source file was deleted.`);
    if (file.operation === 'rename' || file.operation === 'copy') errors.push(`${file.to}: renames and copies are not allowed.`);
    errors.push(...contentErrors(file.to, file.added));
  }
  return { ok: errors.length === 0, empty: files.length === 0, files: files.map((file) => ({ path: file.to, operation: file.operation })), errors };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.patch) throw new Error('--patch is required');
  if (statSync(args.patch).size > LIMITS.bytes * 2) throw new Error('Patch file is far too large to inspect.');
  const result = validatePatch(readFileSync(args.patch, 'utf8'), readJson(args.manifest ?? '', {}));
  const json = JSON.stringify(result, null, 2);
  if (args.out) writeFileSync(args.out, `${json}\n`);
  process.stdout.write(`${json}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
