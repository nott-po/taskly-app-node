#!/usr/bin/env node
// Saves the stream-json output and logs one line per tool call
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const short = (value, max = 160) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function describeTool(block) {
  const input = block.input ?? {};
  const detail = input.command ?? input.file_path ?? input.pattern ?? input.path ?? input.skill ?? '';
  return `${block.name}${detail ? ` ${short(detail)}` : ''}`;
}

export function describe(event, elapsedSeconds = 0) {
  const time = `[${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(Math.floor(elapsedSeconds % 60)).padStart(2, '0')}]`;
  const lines = [];
  if (event?.type === 'system' && event.subtype === 'init') lines.push(`${time} started, model ${event.model}`);
  for (const block of event?.type === 'assistant' ? event.message?.content ?? [] : []) {
    if (block.type === 'tool_use') lines.push(`${time} ${describeTool(block)}`);
  }
  for (const block of event?.type === 'user' ? event.message?.content ?? [] : []) {
    if (block.type === 'tool_result' && block.is_error) {
      const text = Array.isArray(block.content) ? block.content.map((part) => part.text ?? '').join(' ') : block.content;
      lines.push(`${time}   failed: ${short(text, 240)}`);
    }
  }
  if (event?.type === 'result') {
    lines.push(`${time} finished: ${event.subtype}, ${event.num_turns} turns, $${Number(event.total_cost_usd ?? 0).toFixed(2)}`);
    if (event.permission_denials?.length) lines.push(`${time} denied tool calls: ${short(JSON.stringify(event.permission_denials), 600)}`);
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = createWriteStream(args.out);
  const started = Date.now();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    file.write(`${line}\n`);
    let event;
    try { event = JSON.parse(line); } catch { console.log(short(line, 300)); continue; }
    for (const text of describe(event, (Date.now() - started) / 1000)) console.log(text);
  }
  file.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
