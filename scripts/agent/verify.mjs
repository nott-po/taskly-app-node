#!/usr/bin/env node
// Runs in a job without secrets
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestPath, packageOf, parseArgs, readJson } from './lib.mjs';
import { validatePatch } from './validate-patch.mjs';

const METRICS = ['lines', 'statements', 'branches', 'functions'];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(`\n$ (${cwd}) ${command} ${args.join(' ')}\n${output}`);
  return { ok: result.status === 0, output: output.slice(-4000) };
}

export function summarizeVitest(report) {
  if (!report) return { total: 0, passed: 0, failed: 1, failures: [{ name: 'test run', message: 'Vitest produced no report.' }] };
  const failures = [];
  for (const file of report.testResults ?? []) {
    const tests = file.assertionResults ?? [];
    if (file.status === 'failed' && !tests.some((test) => test.status === 'failed')) {
      failures.push({ name: path.basename(file.name), message: (file.message || 'Suite failed to load.').slice(0, 800) });
    }
    for (const test of tests.filter((item) => item.status === 'failed')) {
      failures.push({ name: `${path.basename(file.name)} › ${test.fullName}`, message: (test.failureMessages ?? []).join('\n').slice(0, 800) });
    }
  }
  return {
    total: report.numTotalTests ?? 0,
    passed: report.numPassedTests ?? 0,
    failed: failures.length ? Math.max(report.numFailedTests ?? 0, 1) : 0,
    failures: failures.slice(0, 20),
  };
}

export function coverageDelta(before, after, sources, packageName) {
  const metrics = (entry) => (entry ? Object.fromEntries(METRICS.map((metric) => [metric, entry[metric].pct])) : null);
  const find = (summary, source) => {
    const suffix = `/${source.slice(packageName.length + 1)}`;
    const key = Object.keys(summary ?? {}).find((name) => name !== 'total' && name.replaceAll('\\', '/').endsWith(suffix));
    return metrics(key && summary[key]);
  };
  return {
    total: { before: metrics(before?.total), after: metrics(after?.total) },
    files: sources.map((source) => ({ path: source, before: find(before, source), after: find(after, source) })),
  };
}

export function targetedTests(name, { patched, manifest }) {
  const files = [
    ...patched,
    ...(manifest.changedTests ?? []),
    ...(manifest.packages?.[name] ?? []).filter((source) => source.testExists).map((source) => source.testFile),
  ];
  return [...new Set(files)].filter((file) => packageOf(file) === name && /\.test\.tsx?$/.test(file));
}

export function timeTravelSources(manifest, name) {
  if (!manifest.base) return [];
  return (manifest.packages?.[name] ?? []).filter((source) => source.status === 'modified' || (source.status === 'renamed' && source.previous));
}

// A changed source needs a test that fails on its old version, unless it got no tests or keeps its behaviour
export function unguarded(results, report) {
  const declared = new Map((report?.files ?? []).map((file) => [file.source, file]));
  return results.filter((result) => {
    const entry = declared.get(result.path);
    return !result.skipped && result.failed === 0 && ['created', 'updated'].includes(entry?.action) && !entry?.preservesBehaviour;
  });
}

// Every test has to assert something
function writeGateConfig(name) {
  const base = existsSync(path.join(name, 'vitest.config.ts')) ? './vitest.config' : './vite.config';
  writeFileSync(path.join(name, '.gate-assertions.setup.ts'), "import { beforeEach, expect } from 'vitest';\n\nbeforeEach(() => {\n  expect.hasAssertions();\n});\n");
  writeFileSync(path.join(name, '.gate.vitest.config.mts'), `import { mergeConfig } from 'vitest/config';\nimport base from '${base}';\n\nexport default mergeConfig(base, { test: { setupFiles: ['./.gate-assertions.setup.ts'] } });\n`);
  return './.gate.vitest.config.mts';
}

function changedPaths() {
  const status = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { encoding: 'utf8' }).stdout ?? '';
  return status.split('\0').filter(Boolean).map((line) => line.slice(3));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const work = args.work ?? mkdtempSync(path.join(os.tmpdir(), 'test-agent-'));
  mkdirSync(work, { recursive: true });
  const manifest = readJson(args.manifest, {});
  const report = readJson(args.report ?? '', null);
  const runs = Number(args.runs ?? 3);
  const result = { ok: false, stage: 'validate', validation: validatePatch(readFileSync(args.patch, 'utf8'), manifest), packages: {} };
  const finish = () => {
    writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  };

  const configs = {};
  const vitest = (name, label, extra) => {
    const output = path.join(work, `${name}-${label}.json`);
    rmSync(output, { force: true });
    const config = configs[name] ? ['--config', configs[name]] : [];
    const outcome = run('npx', ['vitest', 'run', ...config, '--reporter=default', '--reporter=json', `--outputFile.json=${output}`, ...extra], name);
    return { ...outcome, summary: summarizeVitest(readJson(output, null)) };
  };
  const coverage = (name, label) => {
    const directory = path.join(work, `${name}-coverage-${label}`);
    const outcome = vitest(name, label, ['--coverage', '--coverage.reportOnFailure', '--coverage.reporter=json-summary', '--coverage.reporter=text-summary', `--coverage.reportsDirectory=${directory}`]);
    return { ...outcome, coverage: readJson(path.join(directory, 'coverage-summary.json'), null) };
  };

  if (!result.validation.ok) return finish();
  const patched = result.validation.files.filter((file) => file.operation !== 'delete').map((file) => file.path);
  const packages = [...new Set([
    ...Object.keys(manifest.packages ?? {}),
    ...(manifest.deletedSources ?? []).map((entry) => packageOf(entry.path)),
    ...(manifest.changedTests ?? []).map(packageOf),
    ...patched.map(packageOf),
  ])].filter(Boolean).sort();

  result.stage = 'install';
  for (const name of packages) {
    const install = run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], name);
    const generate = install.ok && name === 'backend' ? run('npx', ['prisma', 'generate'], name) : install;
    result.packages[name] = { install: generate.ok };
    if (!generate.ok) { result.packages[name].output = generate.output; return finish(); }
  }

  result.stage = 'baseline';
  const baseline = Object.fromEntries(packages.map((name) => [name, coverage(name, 'before').coverage]));

  result.stage = 'apply';
  if (!result.validation.empty) {
    const apply = run('git', ['apply', '--whitespace=nowarn', path.resolve(args.patch)], '.');
    if (!apply.ok) { result.applyOutput = apply.output; return finish(); }
  }
  // Check the files on disk, not just the patch headers
  const outside = changedPaths().filter((file) => !isTestPath(file));
  if (outside.length) {
    result.validation.ok = false;
    result.validation.errors.push(...outside.map((file) => `${file}: changed outside test paths after apply.`));
    return finish();
  }

  result.stage = 'tests';
  let ok = true;
  for (const name of packages) {
    const entry = result.packages[name];
    const typecheck = run('npx', ['tsc', '--noEmit'], name);
    entry.typecheck = typecheck.ok ? { ok: true } : { ok: false, output: typecheck.output };
    configs[name] = writeGateConfig(name);

    const files = targetedTests(name, { patched, manifest });
    entry.targeted = { files, runs: [] };
    for (let attempt = 0; files.length && attempt < runs; attempt++) {
      const seed = 1000 + attempt * 7919;
      const repeat = vitest(name, `targeted-${attempt}`, ['--sequence.shuffle', `--sequence.seed=${seed}`, ...files.map((file) => file.slice(name.length + 1))]);
      entry.targeted.runs.push({ seed, ...repeat.summary });
    }
    const failedRuns = entry.targeted.runs.filter((attempt) => attempt.failed > 0).length;
    entry.targeted.flaky = failedRuns > 0 && failedRuns < entry.targeted.runs.length;

    const full = coverage(name, 'after');
    entry.full = full.summary;
    // Non-zero exit with no failed tests means only the thresholds were missed
    entry.thresholdsMet = full.ok;
    entry.coverage = coverageDelta(baseline[name], full.coverage, (manifest.packages?.[name] ?? []).map((source) => source.path), name);
    ok &&= typecheck.ok && failedRuns === 0 && full.summary.failed === 0 && full.summary.total > 0;

    // Time travel: restore one changed source at a time and count the tests that notice
    entry.timeTravel = [];
    const relative = files.map((file) => file.slice(name.length + 1));
    for (const [index, source] of timeTravelSources(manifest, name).entries()) {
      if (!relative.length) break;
      const old = spawnSync('git', ['show', `${manifest.base}:${source.previous ?? source.path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (old.status !== 0) { entry.timeTravel.push({ path: source.path, skipped: 'no base version' }); continue; }
      const current = readFileSync(source.path, 'utf8');
      writeFileSync(source.path, old.stdout);
      try {
        const travel = vitest(name, `time-travel-${index}`, relative).summary;
        entry.timeTravel.push({ path: source.path, total: travel.total, failed: travel.failed, failing: travel.failures.slice(0, 5).map((failure) => failure.name) });
      } finally {
        writeFileSync(source.path, current);
      }
    }
    entry.unguarded = unguarded(entry.timeTravel, report).map((result) => result.path);
    ok &&= entry.unguarded.length === 0;
  }
  result.ok = ok;
  result.stage = 'done';
  finish();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
