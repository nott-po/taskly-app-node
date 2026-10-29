#!/usr/bin/env node
// Missing or malformed output becomes a "blocked" report instead of a crash
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson } from './lib.mjs';

const DECISIONS = new Set(['tests_written', 'no_tests_needed', 'blocked']);
const ACTIONS = new Set(['created', 'updated', 'deleted', 'unchanged', 'skipped']);

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
const reviewOf = (review) => (review && typeof review === 'object'
  ? { kept: count(review.kept), revised: count(review.revised), dropped: count(review.dropped), notes: typeof review.notes === 'string' ? review.notes : '' }
  : null);

export function normalizeReport(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { report: null, errors: ['Report is not an object.'] };
  if (!DECISIONS.has(value.decision)) errors.push(`Unknown decision: ${value.decision}`);
  if (typeof value.summary !== 'string') errors.push('summary must be a string.');
  if (!Array.isArray(value.files)) errors.push('files must be an array.');
  const files = (Array.isArray(value.files) ? value.files : []).filter((file) => {
    const valid = file && typeof file.source === 'string' && ACTIONS.has(file.action);
    if (!valid) errors.push(`Ignored malformed file entry: ${JSON.stringify(file)?.slice(0, 120)}`);
    return valid;
  });
  const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []);
  return {
    report: {
      decision: DECISIONS.has(value.decision) ? value.decision : 'blocked',
      summary: typeof value.summary === 'string' ? value.summary : '',
      files: files.map((file) => ({ source: file.source, action: file.action, testFile: typeof file.testFile === 'string' ? file.testFile : null, preservesBehaviour: file.preservesBehaviour === true, reason: typeof file.reason === 'string' ? file.reason : '' })),
      review: reviewOf(value.review),
      skillsUsed: strings(value.skillsUsed),
      suspectedBugs: (Array.isArray(value.suspectedBugs) ? value.suspectedBugs : [])
        .filter((bug) => bug && typeof bug.description === 'string')
        .map((bug) => ({ file: typeof bug.file === 'string' ? bug.file : '', description: bug.description })),
    },
    errors,
  };
}

export function extract(raw, error) {
  const blocked = (reason, meta = {}) => ({ decision: 'blocked', summary: reason, files: [], review: null, skillsUsed: [], suspectedBugs: [], meta });
  if (error) return blocked(error);
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    // stream-json has one message per line
    try { result = raw.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)); } catch { return blocked('The agent did not return valid JSON.'); }
  }
  if (Array.isArray(result)) result = result.findLast((message) => message?.type === 'result');
  const meta = { subtype: result?.subtype, turns: result?.num_turns, costUsd: result?.total_cost_usd, durationMs: result?.duration_ms, deniedToolCalls: result?.permission_denials?.length ?? 0 };
  if (!result || result.is_error) {
    const detail = typeof result?.result === 'string' && result.result ? result.result : result?.subtype ?? 'no result';
    const status = result?.api_error_status ? `API status ${result.api_error_status}: ` : '';
    return blocked(`The agent stopped early (${status}${detail}).`, meta);
  }
  let structured = result.structured_output;
  if (structured === undefined && typeof result.result === 'string') {
    // Fall back to the whole text, then to the last fenced json block
    const blocks = [...result.result.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
    for (const candidate of [result.result, blocks.at(-1)]) {
      try { structured = JSON.parse(candidate); break; } catch { structured = undefined; }
    }
  }
  const { report, errors } = normalizeReport(structured);
  if (!report) return blocked('The agent finished without a structured report.', meta);
  return { ...report, meta: { ...meta, ...(errors.length ? { reportWarnings: errors } : {}) } };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw = '';
  if (!args.error) {
    try { raw = readFileSync(args.result, 'utf8'); } catch { args.error = 'The agent produced no output.'; }
  }
  const report = extract(raw, args.error);
  // agent-prompt.mjs put these skills in the prompt, so this list doesn't rely on the agent's word
  const agent = readJson(args.agent ?? '', null);
  if (agent?.skills) report.meta = { ...report.meta, skillsLoaded: agent.skills };
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
