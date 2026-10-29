import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoverageManifest, buildManifest, parseNameStatus } from '../changed-files.mjs';

const nul = (...parts) => `${parts.join('\0')}\0`;

test('parses added, modified, deleted and renamed entries', () => {
  assert.deepEqual(parseNameStatus(nul('M', 'a.ts', 'R087', 'old.ts', 'new.ts', 'D', 'gone.ts')), [
    { status: 'M', path: 'a.ts' },
    { status: 'R', previous: 'old.ts', path: 'new.ts' },
    { status: 'D', path: 'gone.ts' },
  ]);
  assert.deepEqual(parseNameStatus(''), []);
});

test('groups testable sources by package and records existing tests', () => {
  const manifest = buildManifest([
    { status: 'M', path: 'backend/src/core/config.ts' },
    { status: 'A', path: 'frontend/src/lib/http.ts' },
    { status: 'R', previous: 'frontend/src/old.ts', path: 'frontend/src/renamed.ts' },
  ], { exists: (file) => file === 'backend/tests/config.test.ts' });
  assert.deepEqual(manifest.packages.backend, [{ path: 'backend/src/core/config.ts', status: 'modified', testFile: 'backend/tests/config.test.ts', testExists: true }]);
  assert.equal(manifest.packages.frontend[0].testExists, false);
  assert.equal(manifest.packages.frontend[1].previous, 'frontend/src/old.ts');
});

test('maps a .ts source to an existing .test.tsx file', () => {
  const hook = 'frontend/src/features/todos/hooks/useTodosQuery';
  const manifest = buildManifest([{ status: 'M', path: `${hook}.ts` }], { exists: (file) => file === `${hook}.test.tsx` });
  assert.deepEqual([manifest.packages.frontend[0].testFile, manifest.packages.frontend[0].testExists], [`${hook}.test.tsx`, true]);
  const fresh = buildManifest([{ status: 'A', path: `${hook}.ts` }], { exists: () => false });
  assert.equal(fresh.packages.frontend[0].testFile, `${hook}.test.ts`);
  assert.equal(manifest.hasTestableChanges, true);
});

test('skips docs, config, types and stories with a reason', () => {
  const manifest = buildManifest([
    { status: 'M', path: 'README.md' },
    { status: 'M', path: 'backend/package.json' },
    { status: 'M', path: 'backend/src/features/todos/types.ts' },
    { status: 'A', path: 'frontend/src/design-system/components/Card/Card.stories.tsx' },
    { status: 'M', path: '.github/workflows/ci.yml' },
  ], { exists: () => false });
  assert.equal(manifest.hasTestableChanges, false);
  assert.equal(manifest.skipped.length, 5);
  assert.ok(manifest.skipped.every((entry) => entry.reason));
});

test('tracks deleted sources so their tests can be removed', () => {
  const manifest = buildManifest([{ status: 'D', path: 'backend/src/core/legacy.ts' }, { status: 'D', path: 'README.md' }], { exists: () => false });
  assert.deepEqual(manifest.deletedSources, [{ path: 'backend/src/core/legacy.ts', testFile: 'backend/tests/legacy.test.ts' }]);
  assert.equal(manifest.hasTestableChanges, true);
});

test('lists changed tests separately and caps large PRs', () => {
  const entries = Array.from({ length: 4 }, (_, index) => ({ status: 'A', path: `backend/src/f${index}.ts` }));
  const manifest = buildManifest([...entries, { status: 'M', path: 'backend/tests/router.test.ts' }], { exists: () => false, maxFiles: 3 });
  assert.equal(manifest.packages.backend.length, 3);
  assert.equal(manifest.truncated, true);
  assert.deepEqual(manifest.changedTests, ['backend/tests/router.test.ts']);
});

test('ignores unsafe paths instead of passing them to the agent', () => {
  const manifest = buildManifest([{ status: 'A', path: 'backend/src/../../x.ts' }], { exists: () => false });
  assert.equal(manifest.hasTestableChanges, false);
  assert.equal(manifest.skipped[0].reason, 'unsupported path');
});

test('coverage mode lists sources with gaps and the exact uncovered lines, branches and functions', () => {
  const entry = (path, s, b = {}, f = {}) => ({
    path,
    s,
    statementMap: Object.fromEntries(Object.keys(s).map((id) => [id, { start: { line: Number(id) * 10 } }])),
    b,
    branchMap: Object.fromEntries(Object.keys(b).map((id) => [id, { loc: { start: { line: 100 + Number(id) } } }])),
    f,
    fnMap: Object.fromEntries(Object.keys(f).map((id) => [id, { name: `fn${id}` }])),
  });
  const manifest = buildCoverageManifest({
    backend: {
      '/w/backend/src/core/config.ts': entry('/w/backend/src/core/config.ts', { 1: 1, 2: 0 }, { 1: [1, 0] }, { 1: 0, 2: 3 }),
      '/w/backend/src/factory.ts': entry('/w/backend/src/factory.ts', { 1: 4 }, { 1: [1, 1] }, { 1: 1 }),
    },
    frontend: {
      windowsPath: entry(['D:', 'w', 'frontend', 'src', 'features', 'todos', 'hooks', 'useTodosQuery.ts'].join(String.fromCharCode(92)), { 3: 0 }),
    },
  }, { exists: (file) => file === 'frontend/src/features/todos/hooks/useTodosQuery.test.tsx' });
  assert.equal(manifest.mode, 'coverage');
  assert.equal(manifest.hasTestableChanges, true);
  assert.deepEqual(manifest.packages.backend, [{ path: 'backend/src/core/config.ts', status: 'uncovered', testFile: 'backend/tests/config.test.ts', testExists: false, gaps: { lines: [20], branches: [101], functions: ['fn1'] } }]);
  assert.equal(manifest.packages.frontend[0].testFile, 'frontend/src/features/todos/hooks/useTodosQuery.test.tsx');
  assert.equal(manifest.packages.frontend[0].testExists, true);
});

test('coverage mode with full coverage has nothing to do', () => {
  const manifest = buildCoverageManifest({ backend: { a: { path: '/w/backend/src/a.ts', s: { 1: 1 }, statementMap: { 1: { start: { line: 1 } } }, b: {}, branchMap: {}, f: {}, fnMap: {} } } });
  assert.equal(manifest.hasTestableChanges, false);
});
