---
name: review-test-quality
description: Review unit tests you just wrote or changed before reporting them, and keep, revise or drop each one. Use after the tests pass and before the final report.
allowed-tools: Read Grep Glob Edit
---

# Review test quality

Passing tests are not the goal. Each test must catch a real regression in the code it covers. Before you report, read every test you added or changed once more, as a reviewer who did not write it.

## Checklist per test

1. **It would fail if the change were reverted.** Look at the removed and added lines in the diff. If you put the old line back, does this test go red? The verify job checks this: it restores the base version of each changed source and runs your tests again. A changed source that no test notices fails the run, unless you set `preservesBehaviour: true` for it in the report and explain why.
2. **It asserts behaviour, not implementation.** Assert on outputs, status codes, rendered text, roles, calls at module boundaries (API, Prisma, callbacks). Don't assert on internal state, private helpers, or the number of renders.
3. **The assertion is specific.** `toEqual` on the exact value, `toHaveBeenCalledWith` with the exact arguments, `toHaveTextContent('3 overdue')`. Avoid `toBeTruthy`, `toBeDefined` and `not.toThrow` when the value is known.
4. **It is not a duplicate.** Drop a case that exercises the same branch with the same kind of input as another one. Prefer one `it.each` table over copies.
5. **It is deterministic.** No real time, randomness, network or order dependence. Timers are faked and restored, mocks are reset, and globals and env are unstubbed.
6. **The name states the behaviour.** "returns 422 when the date is not a calendar date", not "works" or "test 3".
7. **It asserts something.** Every test needs at least one `expect`. The verify job enforces this with `expect.hasAssertions()`. A `findBy*` query alone is not an assertion.

## Outcome

For each test: **keep**, **revise** (fix it and rerun) or **drop** (delete it). Count them for the report's `review` field. In `review.notes`, name anything you dropped or could not test well, in one or two sentences.
