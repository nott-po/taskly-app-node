import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, isSafePath, isTestPath, parseArgs, testPathFor } from '../lib.mjs';

test('accepts only test files and test helpers as writable paths', () => {
  for (const file of ['backend/tests/config.test.ts', 'backend/tests/fixture.ts', 'frontend/src/lib/http.test.ts', 'frontend/src/App.test.tsx', 'frontend/src/test/todoFixture.ts']) {
    assert.equal(isTestPath(file), true, file);
  }
  for (const file of ['backend/src/factory.ts', 'frontend/src/lib/http.ts', 'backend/package.json', 'backend/vitest.config.ts', 'frontend/src/test/../lib/http.ts', '.github/workflows/x.yml', 'backend/tests/a b.test.ts', '/etc/passwd', 'backend\\tests\\x.test.ts', 'frontend/src/.git/x.test.ts']) {
    assert.equal(isTestPath(file), false, file);
  }
});

test('rejects traversal, absolute and empty paths', () => {
  for (const file of ['', '../x', 'a//b', 'C:/x', '/x', 'a/./b']) assert.equal(isSafePath(file), false, file);
  assert.equal(isSafePath('backend/src/x.ts'), true);
});

test('classifies sources and the files that do not need unit tests', () => {
  assert.deepEqual(classify('backend/src/core/config.ts'), { package: 'backend', kind: 'source' });
  assert.equal(classify('frontend/src/features/todos/hooks/useTodosQuery.ts').kind, 'source');
  assert.equal(classify('backend/src/features/todos/types.ts').kind, 'not-testable');
  assert.equal(classify('frontend/src/design-system/components/Button/Button.tsx').kind, 'not-testable');
  assert.equal(classify('frontend/src/features/todos/index.ts').kind, 'not-testable');
  assert.equal(classify('backend/src/main.ts').kind, 'not-testable');
  assert.equal(classify('backend/src/generated/prisma/client.ts').kind, 'not-testable');
  assert.equal(classify('frontend/src/styles.css').kind, 'other');
  assert.equal(classify('README.md').kind, 'other');
  assert.equal(classify('backend/tests/router.test.ts').kind, 'test');
  assert.equal(classify('frontend/src/test/setup.ts').kind, 'test-support');
});

test('maps sources to the conventional test location', () => {
  assert.equal(testPathFor('backend/src/core/config.ts'), 'backend/tests/config.test.ts');
  assert.equal(testPathFor('frontend/src/lib/http.ts'), 'frontend/src/lib/http.test.ts');
  assert.equal(testPathFor('frontend/src/features/todos/TodosPage.tsx'), 'frontend/src/features/todos/TodosPage.test.tsx');
  assert.equal(testPathFor('docs/x.ts'), null);
});

test('parses flags with and without values', () => {
  assert.deepEqual(parseArgs(['--out', 'x.json', '--dry']), { out: 'x.json', dry: true });
  assert.throws(() => parseArgs(['stray']));
});
