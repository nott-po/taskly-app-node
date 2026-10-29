---
name: run-and-verify-tests
description: Run, typecheck and coverage-check unit tests in backend/ or frontend/ and fix failures in the tests themselves. Use after writing or changing any test, before reporting.
allowed-tools: Bash(backend/node_modules/.bin/vitest run *) Bash(frontend/node_modules/.bin/vitest run *) Bash(backend/node_modules/.bin/tsc --noEmit -p backend) Bash(frontend/node_modules/.bin/tsc --noEmit -p frontend)
---

# Run and verify tests

Run everything from the repository root with exactly these command shapes. They are the only ones allowed. There is no `npm`, `npx` or network access, and dependencies are already installed.

| Goal | Command |
| --- | --- |
| Run some backend tests | `backend/node_modules/.bin/vitest run --root backend tests/config.test.ts` |
| Run some frontend tests | `frontend/node_modules/.bin/vitest run --root frontend src/lib/http.test.ts` |
| Coverage for one file | `backend/node_modules/.bin/vitest run --root backend --coverage --coverage.include=src/core/config.ts --coverage.reporter=text --coverage.thresholds.perFile=false tests/config.test.ts` |
| Typecheck | `backend/node_modules/.bin/tsc --noEmit -p backend` (or `frontend`) |
| Whole suite | `backend/node_modules/.bin/vitest run --root backend` |

Test paths are relative to the package root (`--root`).

## Loop, at most three rounds per file

1. Typecheck. Type errors in tests count as failures.
2. Run the test files you touched.
3. On failure, read the error and decide whose fault it is:
   - **The test is wrong** (bad mock, wrong query, missing `await`, act warning, wrong expectation about behaviour that is clearly intended): fix the test.
   - **The source is wrong** (the behaviour contradicts the diff's intent, the API contract in `backend/openapi.json`, validation rules, or user-facing text): don't change the assertion to match. Remove the case and record a suspected bug.
4. When it passes, run coverage for the changed file. Look at the uncovered lines column and add cases for changed lines and branches that are still uncovered. Don't chase lines the PR didn't touch.
5. Finally run the whole suite of each package you touched, to make sure no other test broke.

Warnings like "not wrapped in act(...)" mean a missing `await`/`waitFor`. Fix them, since they make tests flaky.

## What the verify job checks after you

A clean job without your session repeats the work and decides what gets committed. Pass these checks yourself first:

- **Patch rules.** Only test paths change. Added lines may not contain `.only`, `.skip`, `.todo`, `.fails`, `skipIf`/`runIf`, snapshot matchers, writes to `process.env` (use `vi.stubEnv`), network or `child_process` imports, or `process.exit(`.
- **Typecheck and full suites** of every touched package, with the coverage thresholds.
- **Every test asserts.** Each test runs with `expect.hasAssertions()`.
- **No flakiness.** Your tests run three times in random order. Reset mocks (`vi.clearAllMocks()` in `beforeEach` when mocks are shared), and restore globals, env and timers in `afterEach`.
- **Time travel.** For each modified source, the base version is restored and your tests are run against it. At least one of them must fail, unless you marked the file `preservesBehaviour: true` with a reason. Check that a test asserts the exact new value or branch from the diff, not only something that was already true before.
