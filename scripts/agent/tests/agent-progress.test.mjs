import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe } from '../agent-progress.mjs';

test('prints one line per tool call with its main argument', () => {
  const event = { type: 'assistant', message: { content: [
    { type: 'text', text: 'Looking at the router.' },
    { type: 'tool_use', name: 'Read', input: { file_path: 'backend/src/features/todos/router.ts' } },
    { type: 'tool_use', name: 'Bash', input: { command: 'backend/node_modules/.bin/vitest run --root backend' } },
  ] } };
  assert.deepEqual(describe(event, 75), [
    '[01:15] Read backend/src/features/todos/router.ts',
    '[01:15] Bash backend/node_modules/.bin/vitest run --root backend',
  ]);
});

test('shows failed tool calls and the final result with denials', () => {
  const denied = { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: [{ type: 'text', text: 'Permission denied' }] }] } };
  assert.deepEqual(describe(denied), ['[00:00]   failed: Permission denied']);
  const result = describe({ type: 'result', subtype: 'success', num_turns: 9, total_cost_usd: 0.4, permission_denials: [{ tool_name: 'Bash' }] });
  assert.equal(result[0], '[00:00] finished: success, 9 turns, $0.40');
  assert.match(result[1], /denied tool calls: .*Bash/);
});

test('ignores events it does not know', () => {
  assert.deepEqual(describe({ type: 'stream_event' }), []);
  assert.deepEqual(describe(null), []);
});
