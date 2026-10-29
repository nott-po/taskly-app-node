---
name: analyze-pr-changes
description: Decide which changed source files in a Taskly pull request need new or updated unit tests. Use at the start of a test-generation run, before writing any test.
allowed-tools: Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git show *)
---

# Analyse pull request changes

The workflow already ran `scripts/agent/changed-files.mjs` and gave you a manifest:

```json
{
  "base": "<sha>", "head": "<sha>",
  "packages": { "backend": [{ "path": "backend/src/core/config.ts", "status": "modified", "testFile": "backend/tests/config.test.ts", "testExists": true }] },
  "changedTests": ["frontend/src/lib/http.test.ts"],
  "deletedSources": [{ "path": "...", "testFile": "..." }],
  "skipped": [{ "path": "README.md", "reason": "not TypeScript source" }],
  "truncated": false
}
```

Only files under `packages` and `deletedSources` are your job. `skipped` files were filtered out on purpose, so don't reopen them.

In coverage mode the manifest has `"mode": "coverage"` and no `base`. Each entry also has a `gaps` object, `{ "lines": [12, 13], "branches": [40], "functions": ["remove"] }`, measured on the default branch. There is no diff: write tests that reach exactly those gaps, then confirm with the coverage command from `run-and-verify-tests`. Don't edit existing test cases in coverage mode; add new ones.

## For each source file

1. `git diff <base>...<head> -- <path>` to see what changed. Then read the whole file, since the diff alone hides context.
2. Read `testFile` if `testExists`. Also `grep` for other tests that import the module, because backend tests are flat in `backend/tests/` and one source can be covered elsewhere (e.g. `repository.test.ts` also covers `mappers.ts` indirectly).
3. Decide, using the rules below, and keep a one-line reason for the report. Also note whether the change keeps the observable behaviour (`preservesBehaviour` in the report).

## Decision rules

Write or update tests when the change:
- adds or changes a branch, validation rule, error path, status code, query/mutation behaviour, cache update, or user-visible text or state;
- adds an exported function, hook, component, route, or repository method;
- fixes a bug (add a regression test that fails on the old code).

Update existing tests when an assertion no longer matches *intended* new behaviour visible in the diff. If it's unclear whether a behaviour change was intended, keep the old test, write nothing that hides it, and say so in the report.

Skip with a reason when the change is:
- a pure rename, formatting, comment or import reorder with identical behaviour;
- already covered: the PR itself added or changed tests that exercise the new lines (check `changedTests`);
- type-only, or only wiring with no logic of its own that is already tested through its callers.

For `deletedSources`: delete the matching test file only if it tests nothing but the deleted module. Otherwise remove just the cases for the deleted code.

For `status: renamed`: move nothing. Point the existing test at the new import path if needed.

## Edge cases to look for in the changed code

Boundaries (min/max length, 0, 1, empty string, whitespace only), `null` and `undefined`, missing optional fields, invalid dates, unknown enum values, empty arrays and empty cache, duplicate IDs, HTTP 204/404/413/422/500, network failure and aborted requests, errors that aren't `Error` instances, concurrent or repeated actions (double submit, busy state), timers.
