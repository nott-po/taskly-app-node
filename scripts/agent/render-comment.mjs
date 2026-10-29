#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson } from './lib.mjs';

export const MARKER = '<!-- taskly-test-agent -->';

// Agent text is untrusted: no HTML, images, links or @mentions
export function clean(value, max = 300) {
  const text = String(value ?? '')
    .replace(/<[^>]*>?/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/@(?=[\w-])/g, '@​')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const cell = (value, max) => clean(value, max).replaceAll('|', '\\|') || '-';
const code = (value) => `\`${String(value ?? '').replace(/[`\s]/g, '')}\``;
const pct = (value) => (typeof value === 'number' ? `${value.toFixed(1)}%` : 'n/a');
const delta = (entry, metric) => `${pct(entry?.before?.[metric])} → ${pct(entry?.after?.[metric])}`;

function headline({ report, verify, commit, pushError, skipped }) {
  if (skipped) return `Skipped: ${clean(skipped)}`;
  if (!report) return 'The agent did not produce a report.';
  if (verify && !verify.ok) {
    const unguarded = Object.values(verify.packages ?? {}).flatMap((entry) => entry.unguarded ?? []);
    if (verify.stage === 'done' && unguarded.length) return `Verification failed: no test notices the change in ${unguarded.map(code).join(', ')}. Nothing was committed.`;
    return verify.stage === 'done' ? 'Verification failed. Nothing was committed.' : `Verification failed at the \`${verify.stage}\` stage. Nothing was committed.`;
  }
  if (pushError) return `Tests passed verification but could not be pushed: ${clean(pushError, 200)}`;
  // A missing report shouldn't hide a verified commit
  if (commit && report.decision === 'blocked') return `Verified tests were committed in ${code(commit.slice(0, 12))}, but the agent's report is missing, so per-file decisions are not shown.`;
  if (commit) return `Verified tests were committed in ${code(commit.slice(0, 12))}.`;
  if (report.decision === 'blocked') return 'The agent could not finish. Nothing was committed.';
  if (report.decision === 'no_tests_needed') return 'No test changes needed. Existing tests were run.';
  return verify ? 'Tests passed verification.' : 'Tests were not verified.';
}

export function renderComment({ report, verify, manifest, commit, pushError, skipped, runUrl }) {
  const lines = [MARKER, '## Unit test agent', '', `**${headline({ report, verify, commit, pushError, skipped })}**`, ''];
  if (report?.summary) lines.push(`> ${clean(report.summary, 600)}`, '');

  if (report?.files?.length) {
    lines.push('### Decisions', '', '| Source | Action | Test file | Reason |', '| --- | --- | --- | --- |');
    for (const file of report.files) lines.push(`| ${code(file.source)} | ${cell(file.action, 20)} | ${file.testFile ? code(file.testFile) : '-'} | ${cell(file.reason, 200)} |`);
    lines.push('');
  }
  const skippedFiles = manifest?.skipped ?? [];
  if (skippedFiles.length) {
    lines.push(`<details><summary>${skippedFiles.length} changed file(s) not analysed</summary>`, '');
    for (const file of skippedFiles.slice(0, 50)) lines.push(`- ${code(file.path)}: ${clean(file.reason, 100)}`);
    lines.push('', '</details>', '');
  }
  if (manifest?.truncated) lines.push('> The PR has more changed files than one run analyses. The rest are listed above.', '');

  if (verify?.validation && !verify.validation.ok) {
    lines.push('### Patch rejected', '');
    for (const error of verify.validation.errors.slice(0, 20)) lines.push(`- ${clean(error, 200)}`);
    lines.push('');
  }
  const packages = Object.entries(verify?.packages ?? {});
  if (packages.some(([, entry]) => entry.full)) {
    lines.push('### Verification', '', '| Package | Typecheck | Changed tests, shuffled runs | Full suite | Thresholds | Lines (total) |', '| --- | --- | --- | --- | --- | --- |');
    for (const [name, entry] of packages) {
      const runs = entry.targeted?.runs ?? [];
      const runText = runs.length ? `${runs.filter((attempt) => attempt.failed === 0).length}/${runs.length} passed${entry.targeted.flaky ? ' (flaky)' : ''}` : 'none';
      const full = entry.full ? `${entry.full.passed}/${entry.full.total} passed` : 'not run';
      lines.push(`| ${name} | ${entry.typecheck?.ok ? 'pass' : 'fail'} | ${runText} | ${full} | ${entry.thresholdsMet ? 'met' : 'not met'} | ${delta(entry.coverage?.total, 'lines')} |`);
    }
    lines.push('');
    const travels = packages.flatMap(([, entry]) => (entry.timeTravel ?? []).map((travel) => ({ ...travel, unguarded: (entry.unguarded ?? []).includes(travel.path) })));
    if (travels.length) {
      const declared = new Map((report?.files ?? []).map((file) => [file.source, file]));
      lines.push('#### Do the tests notice the change?', '', 'Each changed source was put back to its base version, one at a time, and the tests were run against it.', '', '| Source | Tests failing on the base version | Verdict |', '| --- | --- | --- |');
      for (const travel of travels) {
        const verdict = travel.skipped ? clean(travel.skipped, 60)
          : travel.failed > 0 ? 'guarded'
            : travel.unguarded ? '**not guarded**'
              : declared.get(travel.path)?.preservesBehaviour ? 'not expected (behaviour-preserving)' : 'no new tests for this file';
        lines.push(`| ${code(travel.path)} | ${travel.skipped ? '-' : `${travel.failed} of ${travel.total}`} | ${verdict} |`);
      }
      lines.push('');
    }
    const files = packages.flatMap(([, entry]) => entry.coverage?.files ?? []);
    if (files.length) {
      lines.push('#### Coverage of changed files', '', '| File | Lines | Branches |', '| --- | --- | --- |');
      for (const file of files) lines.push(`| ${code(file.path)} | ${delta(file, 'lines')} | ${delta(file, 'branches')} |`);
      lines.push('');
    }
    const failures = packages.flatMap(([name, entry]) => [...(entry.full?.failures ?? []), ...(entry.targeted?.runs ?? []).flatMap((attempt) => attempt.failures ?? [])].map((failure) => ({ package: name, ...failure })));
    if (failures.length) {
      lines.push('<details><summary>Failing tests</summary>', '', '```text');
      for (const failure of failures.slice(0, 10)) lines.push(`[${failure.package}] ${failure.name}`, `  ${String(failure.message).replaceAll('```', "'''").slice(0, 600)}`);
      lines.push('```', '', '</details>', '');
    }
    const typecheckOutput = packages.filter(([, entry]) => entry.typecheck && !entry.typecheck.ok);
    for (const [name, entry] of typecheckOutput) lines.push(`<details><summary>Typecheck output (${name})</summary>`, '', '```text', entry.typecheck.output.replaceAll('```', "'''"), '```', '', '</details>', '');
  }

  if (report?.review) {
    const { kept, revised, dropped, notes } = report.review;
    lines.push(`**Self-review:** ${kept} kept, ${revised} revised, ${dropped} dropped.${notes ? ` ${clean(notes, 300)}` : ''}`, '');
  }

  if (report?.suspectedBugs?.length) {
    lines.push('### Suspected bugs in the changed code', '');
    for (const bug of report.suspectedBugs) lines.push(`- ${bug.file ? `${code(bug.file)}: ` : ''}${clean(bug.description, 400)}`);
    lines.push('');
  }

  const footer = [];
  const meta = report?.meta ?? {};
  if (meta.skillsLoaded?.length) footer.push(`Skills loaded: ${meta.skillsLoaded.map(code).join(', ')}`);
  else if (report?.skillsUsed?.length) footer.push(`Skills: ${report.skillsUsed.map(code).join(', ')}`);
  if (meta.turns) footer.push(`${meta.turns} turns`);
  if (meta.deniedToolCalls) footer.push(`${meta.deniedToolCalls} tool call(s) denied`);
  if (typeof meta.costUsd === 'number') footer.push(`$${meta.costUsd.toFixed(2)}`);
  if (runUrl) footer.push(`[Workflow run and artifacts](${runUrl})`);
  if (footer.length) lines.push(`<sub>${footer.join(' · ')}</sub>`, '');
  lines.push('<sub>Add the `skip-test-agent` label to turn this off for the PR.</sub>');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const markdown = renderComment({
    report: readJson(args.report ?? '', null),
    verify: readJson(args.verify ?? '', null),
    manifest: readJson(args.manifest ?? '', null),
    commit: typeof args.commit === 'string' ? args.commit : '',
    pushError: typeof args['push-error'] === 'string' ? args['push-error'] : '',
    skipped: typeof args.skipped === 'string' ? args.skipped : '',
    runUrl: typeof args['run-url'] === 'string' ? args['run-url'] : '',
  });
  writeFileSync(args.out, markdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
