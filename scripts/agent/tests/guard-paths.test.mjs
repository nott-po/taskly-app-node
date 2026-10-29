import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkToolCall } from '../guard-paths.mjs';

const root = path.resolve('/repo');
const hook = fileURLToPath(new URL('../guard-paths.mjs', import.meta.url));

test('allows writes to test files, relative or absolute', () => {
  assert.equal(checkToolCall({ tool_name: 'Write', tool_input: { file_path: 'backend/tests/x.test.ts' } }, root).allowed, true);
  assert.equal(checkToolCall({ tool_name: 'Edit', tool_input: { file_path: path.join(root, 'frontend/src/lib/http.test.ts') } }, root).allowed, true);
});

test('blocks writes to source files and paths outside the repository', () => {
  for (const file of ['backend/src/factory.ts', '../outside.test.ts', path.resolve('/tmp/x.test.ts'), '.claude/settings.json']) {
    assert.equal(checkToolCall({ tool_name: 'Write', tool_input: { file_path: file } }, root).allowed, false, file);
  }
});

test('ignores tools that do not write files and blocks unreadable input', () => {
  assert.equal(checkToolCall({ tool_name: 'Read', tool_input: { file_path: 'backend/src/factory.ts' } }, root).allowed, true);
  assert.equal(checkToolCall(null, root).allowed, false);
  assert.equal(checkToolCall({ tool_name: 'Write', tool_input: {} }, root).allowed, false);
});

test('exits with code 2 so Claude Code blocks the call', () => {
  const run = (event) => spawnSync(process.execPath, [hook], { input: JSON.stringify(event), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
  const blocked = run({ tool_name: 'Write', tool_input: { file_path: 'backend/src/factory.ts' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /not a test file/);
  assert.equal(run({ tool_name: 'Write', tool_input: { file_path: 'backend/tests/a.test.ts' } }).status, 0);
});
