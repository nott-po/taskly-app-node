import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extract } from '../extract-report.mjs';
import { MARKER, clean, renderComment } from '../render-comment.mjs';
import { coverageDelta, summarizeVitest, targetedTests, timeTravelSources, unguarded } from '../verify.mjs';

const report = { decision: 'tests_written', summary: 'Added tests.', files: [{ source: 'backend/src/core/config.ts', action: 'created', testFile: 'backend/tests/config.test.ts', reason: 'New branch logic.' }], skillsUsed: ['backend-unit-tests'], suspectedBugs: [] };

test('reads the structured output of a successful run', () => {
  const result = extract(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 12, total_cost_usd: 0.42, structured_output: report }));
  assert.equal(result.decision, 'tests_written');
  assert.equal(result.files[0].testFile, 'backend/tests/config.test.ts');
  assert.equal(result.meta.turns, 12);
});

test('falls back to a blocked report for every kind of bad output', () => {
  assert.equal(extract('not json').decision, 'blocked');
  assert.equal(extract('', 'ANTHROPIC_API_KEY is not set.').summary, 'ANTHROPIC_API_KEY is not set.');
  assert.equal(extract(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true })).summary, 'The agent stopped early (error_max_turns).');
  assert.equal(
    extract(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'Invalid API key' })).summary,
    'The agent stopped early (API status 401: Invalid API key).',
  );
  assert.equal(extract(JSON.stringify({ type: 'result', subtype: 'success', result: 'plain text' })).decision, 'blocked');
  assert.equal(extract(JSON.stringify({ type: 'result', structured_output: { ...report, decision: 'merge_it' } })).decision, 'blocked');
});

test('reads the result line of stream-json output', () => {
  const lines = [{ type: 'system', subtype: 'init' }, { type: 'assistant', message: { content: [] } }, { type: 'result', subtype: 'success', num_turns: 4, structured_output: report }];
  const result = extract(lines.map((line) => JSON.stringify(line)).join('\n'));
  assert.equal(result.decision, 'tests_written');
  assert.equal(result.meta.turns, 4);
});

test('reads a report written as a json block at the end of the text', () => {
  const text = `I wrote the tests.\n\n\`\`\`json\n{"decision":"blocked"}\n\`\`\`\n\nFinal:\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``;
  assert.equal(extract(JSON.stringify({ type: 'result', subtype: 'success', result: text })).decision, 'tests_written');
});

test('accepts the message array form and drops malformed file entries', () => {
  const result = extract(JSON.stringify([{ type: 'system' }, { type: 'result', structured_output: { ...report, files: [...report.files, { source: 1 }] } }]));
  assert.equal(result.files.length, 1);
  assert.equal(result.meta.reportWarnings.length, 1);
});

test('strips HTML, images, links and mentions from agent text', () => {
  assert.equal(clean('<img src=x onerror=alert(1)>hi @octocat ![p](https://evil/x.png) [docs](https://evil)'), 'hi @​octocat p docs');
  assert.equal(clean('x'.repeat(50), 10).length, 10);
});

test('keeps comparison operators in agent text', () => {
  assert.equal(clean('changed `<` to `<=`, so a < b and b > a'), 'changed `<` to `<=`, so a < b and b > a');
  assert.equal(clean('a <script>alert(1)</script> b <b'), 'a alert(1) b');
});

test('renders a sticky comment with decisions and verification results', () => {
  const verify = { ok: true, stage: 'done', validation: { ok: true, errors: [] }, packages: { backend: {
    typecheck: { ok: true }, thresholdsMet: true, full: { total: 60, passed: 60, failed: 0, failures: [] },
    targeted: { files: ['backend/tests/config.test.ts'], runs: [{ failed: 0 }, { failed: 0 }, { failed: 0 }], flaky: false },
    coverage: { total: { before: { lines: 30 }, after: { lines: 95 } }, files: [{ path: 'backend/src/core/config.ts', before: { lines: 0, branches: 0 }, after: { lines: 100, branches: 100 } }] },
  } } };
  const markdown = renderComment({ report, verify, commit: 'abcdef1234567890', runUrl: 'https://github.com/o/r/actions/runs/1' });
  assert.ok(markdown.startsWith(MARKER));
  assert.match(markdown, /committed in `abcdef123456`/);
  assert.match(markdown, /\| backend \| pass \| 3\/3 passed \| 60\/60 passed \| met \| 30\.0% → 95\.0% \|/);
  assert.match(markdown, /`backend\/src\/core\/config.ts` \| 0\.0% → 100\.0%/);
});

test('explains why nothing was committed', () => {
  const rejected = { ok: false, stage: 'validate', validation: { ok: false, errors: ['backend/src/x.ts: only test files and test helpers may be changed.'] }, packages: {} };
  assert.match(renderComment({ report, verify: rejected }), /Verification failed at the `validate` stage[\s\S]*Patch rejected/);
  assert.match(renderComment({ skipped: 'only docs changed' }), /Skipped: only docs changed/);
  assert.match(renderComment({ report: { ...report, decision: 'blocked', summary: 'Timed out.' } }), /could not finish/);
  const verified = { ok: true, stage: 'done', validation: { ok: true, errors: [] }, packages: {} };
  assert.match(renderComment({ report: { ...report, decision: 'blocked' }, verify: verified, commit: 'abcdef1234567890' }), /committed in `abcdef123456`, but the agent's report is missing/);
});

test('summarizes Vitest reports including suites that fail to load', () => {
  const summary = summarizeVitest({ numTotalTests: 2, numPassedTests: 1, numFailedTests: 1, testResults: [
    { name: '/r/a.test.ts', status: 'failed', assertionResults: [{ fullName: 'works', status: 'failed', failureMessages: ['expected 1'] }] },
    { name: '/r/b.test.ts', status: 'failed', message: 'SyntaxError', assertionResults: [] },
  ] });
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.failures.map((failure) => failure.name), ['a.test.ts › works', 'b.test.ts']);
  assert.equal(summarizeVitest(null).failed, 1);
});

test('matches coverage entries by path and picks targeted tests per package', () => {
  const summary = { total: { lines: { pct: 50 }, statements: { pct: 50 }, branches: { pct: 40 }, functions: { pct: 60 } }, '/home/runner/work/r/backend/src/core/config.ts': { lines: { pct: 100 }, statements: { pct: 100 }, branches: { pct: 90 }, functions: { pct: 100 } } };
  const result = coverageDelta(null, summary, ['backend/src/core/config.ts', 'backend/src/new.ts'], 'backend');
  assert.equal(result.files[0].after.lines, 100);
  assert.equal(result.files[0].before, null);
  assert.equal(result.files[1].after, null);
  const manifest = { changedTests: ['frontend/src/a.test.ts'], packages: { backend: [{ path: 'backend/src/x.ts', testFile: 'backend/tests/x.test.ts', testExists: true }] } };
  assert.deepEqual(targetedTests('backend', { patched: ['backend/tests/fixture.ts', 'backend/tests/y.test.ts'], manifest }), ['backend/tests/y.test.ts', 'backend/tests/x.test.ts']);
});

test('keeps the self-review and the behaviour flag, and defaults them safely', () => {
  const withReview = { ...report, files: [{ ...report.files[0], preservesBehaviour: true }], review: { kept: 3, revised: 1, dropped: -2, notes: 'ok' } };
  const result = extract(JSON.stringify({ type: 'result', subtype: 'success', structured_output: withReview, permission_denials: [{}, {}] }));
  assert.deepEqual(result.review, { kept: 3, revised: 1, dropped: 0, notes: 'ok' });
  assert.equal(result.files[0].preservesBehaviour, true);
  assert.equal(result.meta.deniedToolCalls, 2);
  const legacy = extract(JSON.stringify({ type: 'result', subtype: 'success', structured_output: report }));
  assert.equal(legacy.review, null);
  assert.equal(legacy.files[0].preservesBehaviour, false);
});

test('time travel covers modified and renamed sources only, and only with a base', () => {
  const manifest = { base: 'abc', packages: { backend: [
    { path: 'backend/src/a.ts', status: 'modified' },
    { path: 'backend/src/b.ts', status: 'added' },
    { path: 'backend/src/c.ts', status: 'renamed', previous: 'backend/src/old.ts' },
  ] } };
  assert.deepEqual(timeTravelSources(manifest, 'backend').map((source) => source.path), ['backend/src/a.ts', 'backend/src/c.ts']);
  assert.deepEqual(timeTravelSources({ ...manifest, base: undefined }, 'backend'), []);
});

test('a source is unguarded only when the agent wrote tests for a behaviour change that none of them notice', () => {
  const results = [
    { path: 'a.ts', total: 5, failed: 0 },
    { path: 'b.ts', total: 5, failed: 2 },
    { path: 'c.ts', total: 5, failed: 0 },
    { path: 'd.ts', total: 5, failed: 0 },
    { path: 'e.ts', skipped: 'no base version' },
  ];
  const files = [
    { source: 'a.ts', action: 'updated', preservesBehaviour: false },
    { source: 'b.ts', action: 'created', preservesBehaviour: false },
    { source: 'c.ts', action: 'updated', preservesBehaviour: true },
    { source: 'd.ts', action: 'unchanged', preservesBehaviour: false },
    { source: 'e.ts', action: 'created', preservesBehaviour: false },
  ];
  assert.deepEqual(unguarded(results, { files }).map((result) => result.path), ['a.ts']);
});

test('the comment shows the time-travel verdicts, the self-review and the loaded skills', () => {
  const verify = { ok: false, stage: 'done', packages: { backend: {
    typecheck: { ok: true }, targeted: { files: [], runs: [{ failed: 0 }] }, full: { total: 10, passed: 10, failed: 0, failures: [] }, thresholdsMet: true,
    timeTravel: [{ path: 'backend/src/a.ts', total: 4, failed: 0 }, { path: 'backend/src/b.ts', total: 4, failed: 3 }], unguarded: ['backend/src/a.ts'],
  } } };
  const markdown = renderComment({ report: { ...report, review: { kept: 4, revised: 0, dropped: 1, notes: 'Dropped a duplicate.' }, meta: { skillsLoaded: ['analyze-pr-changes', 'test-report'], turns: 9 } }, verify });
  assert.match(markdown, /no test notices the change in `backend\/src\/a.ts`/);
  assert.match(markdown, /\| `backend\/src\/a.ts` \| 0 of 4 \| \*\*not guarded\*\* \|/);
  assert.match(markdown, /\| `backend\/src\/b.ts` \| 3 of 4 \| guarded \|/);
  assert.match(markdown, /Self-review:\*\* 4 kept, 0 revised, 1 dropped\. Dropped a duplicate\./);
  assert.match(markdown, /Skills loaded: `analyze-pr-changes`, `test-report`/);
});
