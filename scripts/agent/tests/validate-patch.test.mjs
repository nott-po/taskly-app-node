import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, validatePatch } from '../validate-patch.mjs';

const diff = (file, header = '') => `diff --git a/${file} b/${file}\n${header}--- a/${file}\n+++ b/${file}\n@@ -0,0 +1 @@\n+x\n`;

test('accepts new and changed test files', () => {
  const result = validatePatch(diff('backend/tests/config.test.ts', 'new file mode 100644\n') + diff('frontend/src/lib/http.test.ts'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.files, [
    { path: 'backend/tests/config.test.ts', operation: 'create' },
    { path: 'frontend/src/lib/http.test.ts', operation: 'modify' },
  ]);
});

test('treats an empty patch as valid and empty', () => {
  assert.deepEqual(validatePatch(''), { ok: true, empty: true, files: [], errors: [] });
});

test('rejects source, config and workflow changes', () => {
  for (const file of ['backend/src/factory.ts', 'frontend/package.json', 'frontend/vite.config.ts', '.github/workflows/ci.yml', '.claude/settings.json']) {
    assert.equal(validatePatch(diff(file)).ok, false, file);
  }
});

test('rejects renames that move a test into source', () => {
  const patch = 'diff --git a/backend/tests/x.test.ts b/backend/src/x.ts\nsimilarity index 100%\nrename from backend/tests/x.test.ts\nrename to backend/src/x.ts\n';
  assert.equal(validatePatch(patch).ok, false);
});

test('rejects binaries, executables, symlinks and quoted paths', () => {
  assert.equal(validatePatch('diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\nBinary files a and b differ\n').ok, false);
  assert.equal(validatePatch(diff('backend/tests/a.test.ts', 'new file mode 100755\n')).ok, false);
  assert.equal(validatePatch(diff('backend/tests/a.test.ts', 'new file mode 120000\n')).ok, false);
  assert.equal(validatePatch('diff --git "a/backend/tests/a b.test.ts" "b/backend/tests/a b.test.ts"\n').ok, false);
});

test('allows deleting a test only when its source was deleted', () => {
  const patch = diff('backend/tests/legacy.test.ts', 'deleted file mode 100644\n');
  assert.equal(validatePatch(patch).ok, false);
  assert.equal(validatePatch(patch, { deletedSources: [{ path: 'backend/src/legacy.ts', testFile: 'backend/tests/legacy.test.ts' }] }).ok, true);
});

test('rejects input that is not a git diff and oversized patches', () => {
  assert.equal(validatePatch('rm -rf /\n').ok, false);
  assert.equal(validatePatch(diff('backend/tests/a.test.ts') + '+'.repeat(LIMITS.bytes)).ok, false);
  const many = Array.from({ length: LIMITS.files + 1 }, (_, index) => diff(`backend/tests/t${index}.test.ts`)).join('');
  assert.equal(validatePatch(many).ok, false);
});

const withLines = (file, lines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,${lines.length + 1} @@\n context\n${lines.map((line) => `+${line}`).join('\n')}\n`;

test('rejects focused, skipped and inverted tests in added lines', () => {
  for (const line of ["it.only('x', () => {})", "describe.skip('x', () => {})", "test.todo('x')", "it.fails('x', () => {})", "test.skipIf(true)('x', () => {})", "xit('x', () => {})", "fdescribe('x', () => {})", '  ctx.skip()']) {
    assert.equal(validatePatch(withLines('frontend/src/lib/http.test.ts', [line])).ok, false, line);
  }
});

test('rejects snapshots, env writes, network modules and process.exit', () => {
  for (const line of ['expect(tree).toMatchSnapshot()', 'expect(x).toMatchInlineSnapshot(`1`)', "process.env.DATABASE_URL = 'x'", "process.env['PORT'] ??= '1'", 'delete process.env.PORT', "import http from 'node:http'", "const net = require('net')", "import axios from 'axios'", 'process.exit(0)']) {
    assert.equal(validatePatch(withLines('backend/tests/config.test.ts', [line])).ok, false, line);
  }
});

test('accepts ordinary test code and ignores removed lines and comments', () => {
  const lines = ["vi.stubEnv('PORT', '8000')", "it('reads process.env through config', () => {", '  expect(process.env.PORT).toBe("8000")', "  if (env.PORT === '1') expect(true).toBe(true)", '})', '// it.only is not used here', "vi.mock('../src/core/database')"];
  assert.deepEqual(validatePatch(withLines('backend/tests/config.test.ts', lines)).errors, []);
  const removed = 'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts\n--- a/backend/tests/a.test.ts\n+++ b/backend/tests/a.test.ts\n@@ -1,2 +1,1 @@\n-it.only(\'x\', () => {})\n keep\n';
  assert.equal(validatePatch(removed).ok, true);
});
