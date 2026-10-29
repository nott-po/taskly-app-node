#!/usr/bin/env node
// PreToolUse hook: exit code 2 blocks the write and shows stderr to the agent
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestPath, toPosix } from './lib.mjs';

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export function checkToolCall(event, projectDir) {
  if (!event || typeof event !== 'object') return { allowed: false, reason: 'Unreadable hook input.' };
  if (!WRITE_TOOLS.has(event.tool_name)) return { allowed: true };
  const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path;
  if (typeof target !== 'string') return { allowed: false, reason: 'Missing file path.' };
  const relative = toPosix(path.relative(projectDir, path.resolve(projectDir, target)));
  if (isTestPath(relative)) return { allowed: true };
  return {
    allowed: false,
    reason: `Blocked: ${relative} is not a test file. Only backend/tests/**/*.ts, frontend/src/**/*.test.ts(x) and frontend/src/test/** may be written. Report source problems as suspected bugs instead.`,
  };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let event;
  try { event = JSON.parse(input); } catch { event = null; }
  const result = checkToolCall(event, process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!result.allowed) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
