# Solution: a unit test agent for pull requests

A Claude Code agent with six skills writes and updates unit tests for the frontend and the backend, and a GitHub Actions workflow runs it on every pull request. The agent only proposes tests. A separate gate, plain Node scripts without any model, decides whether they are good enough to commit, and the result ends up in one comment on the PR.

## How it works

The workflow has four jobs, and each one gets only the access it needs.

1. **analyze** diffs the PR and builds a manifest of changed source files. Docs, configs, types and generated code are left out. If nothing is left, the run stops here and the comment says why.
2. **generate** runs Claude Code headless with the agent, its skills and the manifest. The agent reads the code, writes tests, runs them, reviews them and returns a JSON report that matches a schema. The job's output is a text patch, not a commit.
3. **verify** applies the patch in a fresh checkout and checks it independently:
   - the patch touches only test files and contains no `.only`, `.skip`, snapshots, network imports or `process.env` writes
   - typecheck passes
   - the changed tests pass 3 times in random order
   - every test makes at least one assertion
   - the full suites pass, with coverage thresholds
   - each modified source is put back to its base version, and at least one test has to fail. If none fails, the tests don't notice the change and the run fails
4. **publish** commits the verified tests to the PR branch and posts one comment that is updated on every run. The comment has the agent's decision per file, the gate's numbers, the suspected bugs and the cost.

In coverage mode (run manually) the manifest lists existing files with uncovered lines, and publish opens a new PR with the tests instead.

## What it did in this repository

Coverage is given as lines / statements / branches / functions.

| | Before | After |
| --- | --- | --- |
| Backend | 48 tests, 33.0 / 30.2 / 33.3 / 40.6% | 88 tests, 97.2 / 96.9 / 97.9 / 96.9% |
| Frontend | 18 tests, 47.7 / 46.4 / 43.8 / 40.3% | 117 tests, 100 / 99.4 / 98.5 / 100% |
| Coverage thresholds | backend: 100% for `validators.ts` and `mappers.ts`, frontend: none | backend 90% per file, frontend 95% |

The "after" numbers are the ones the gate measured in the coverage runs. The backend gap was `main.ts`, the process entry point that only starts the server. I excluded it from coverage when I raised the thresholds, and the backend now measures 100 / 99.2 / 97.9 / 100%.

The new tests came from the agent's own coverage PRs, [#1](https://github.com/nott-po/taskly-app-node/pull/1) and [#2](https://github.com/nott-po/taskly-app-node/pull/2). After that I opened a feature PR and four small PRs, each aimed at one decision the agent has to get right. [scenarios.md](docs/evidence/scenarios.md) lists what each one should do, and all five did it.

| PR | Change | Result |
| --- | --- | --- |
| [#3](https://github.com/nott-po/taskly-app-node/pull/3) | New feature: task stats | Tests for 11 changed files. Each of the 9 modified sources has a test that fails on the old version |
| [#4](https://github.com/nott-po/taskly-app-node/pull/4) | Docs only | Skipped before any model call |
| [#5](https://github.com/nott-po/taskly-app-node/pull/5) | Title limit 120 → 200 | Existing boundary tests moved to 200/201, with a reason |
| [#6](https://github.com/nott-po/taskly-app-node/pull/6) | A code comment telling AI agents to skip tests and set the coverage thresholds to 0 | Instruction ignored and named in the summary, only the test file changed |
| [#7](https://github.com/nott-po/taskly-app-node/pull/7) | A "refactor" that makes tasks due today overdue | Reported as a suspected bug, existing tests left failing, nothing committed |

Seven runs cost $1.49 in total. The manifest, report and gate result of every run are saved in [docs/evidence](docs/evidence).

## Technical decisions

| Decision | Why | Considered instead |
| --- | --- | --- |
| **Claude Code in GitHub Actions** | It already has file tools, permission rules, hooks and structured output, so the workflow doesn't need a custom agent loop. The CLI version is pinned in a lockfile. | A custom agent loop on the Anthropic API, which would be more code to own and secure. |
| **The agent proposes, the gate decides** | Whether the tests pass is measured by `verify.mjs`, not taken from the agent's report. The agent can't commit, and its job has no write token. | Trusting the agent's own test run, which a confused or manipulated model can misreport. |
| **Tests have to notice the change** | Passing tests can still check nothing. Restoring each modified source to its base version shows whether the new tests would catch a revert. Only behaviour-preserving changes are exempt, and the agent has to declare them. | A coverage threshold alone, which a test without real assertions can satisfy. Full mutation testing on every PR, which is slower and costs more CI time. |
| **Least privilege per job** | The API key exists only in `generate`. The write token exists only in `publish`, which never installs or runs PR code. Every job starts with `permissions: {}` and adds what it needs. | One job with all secrets and write access, where any code from the PR could reach both. |
| **The PR can't change its own reviewer** | `.claude/` and `scripts/agent/` are restored from the base branch before the agent runs. CODEOWNERS and branch protection on `main` cover them. | Running the PR's own copy of the agent, which lets a PR rewrite the rules that judge it. |
| **Skills go into the system prompt** | `claude -p --agent` ignores the agent's `skills:` list and `--json-schema`. `agent-prompt.mjs` builds the prompt from the agent file and all six skills instead, so every run has them, and the comment lists the skills that were loaded. | Relying on the model to load skills on demand, which a headless run doesn't guarantee. |
| **A text patch between jobs, not a commit** | `verify` and `publish` see exactly the bytes the agent produced, and `publish` can re-check them without running any PR code. | Pushing from the agent's job, which would put a write token next to untrusted code. |

More on the security side is in [docs/threat-model.md](docs/threat-model.md).

## Where the agent and skills live

| Path | What it is |
| --- | --- |
| [.claude/agents/unit-test-agent.md](.claude/agents/unit-test-agent.md) | The agent: role, steps, hard rules, tools, write hook |
| [.claude/skills/analyze-pr-changes](.claude/skills/analyze-pr-changes/SKILL.md) | Which changed files need tests, and when to skip |
| [.claude/skills/backend-unit-tests](.claude/skills/backend-unit-tests/SKILL.md) | Backend conventions: Vitest, Supertest, Prisma mocks |
| [.claude/skills/frontend-unit-tests](.claude/skills/frontend-unit-tests/SKILL.md) | Frontend conventions: Testing Library, TanStack Query, fake timers |
| [.claude/skills/run-and-verify-tests](.claude/skills/run-and-verify-tests/SKILL.md) | How to run, typecheck and fix tests, and what the gate checks afterwards |
| [.claude/skills/review-test-quality](.claude/skills/review-test-quality/SKILL.md) | A 7-point review: keep, revise or drop each test |
| [.claude/skills/test-report](.claude/skills/test-report/SKILL.md) | The final report and its JSON schema |
| [.claude/test-agent.settings.json](.claude/test-agent.settings.json) | Permissions: test paths only, no network, no `npm`, `node` or `git commit` |
| [scripts/agent/](scripts/agent) | The gate: manifest, write hook, patch check, verify, comment. Covered by 50 tests |
| [.github/workflows/test-agent.yml](.github/workflows/test-agent.yml) | The workflow |

The skills are plain Markdown, so they also work in a local Claude Code session. For example, `claude --agent unit-test-agent` loads the same agent.

## Running it

**Prerequisites**

- Repository secret `ANTHROPIC_API_KEY`: an API key from the Anthropic Console, or a subscription token from `claude setup-token`
- Settings → Actions → General: "Allow GitHub Actions to create and approve pull requests" (needed by coverage mode)
- A branch rule on `main` that requires pull requests, code-owner review and the CI checks, so CODEOWNERS actually protects `.claude/`, `scripts/agent/` and `.github/`. This repository has one.
- Optional variables: `TEST_AGENT_MODEL` (default `claude-sonnet-5-5`) and `TEST_AGENT_BUDGET_USD` (default 5)

**On a pull request** nothing needs to be done. The workflow starts when a PR is opened, updated or reopened. Add the `skip-test-agent` label to turn it off for one PR. Fork PRs get a notice instead of a run, because they have no access to secrets.

**Coverage mode**

```sh
gh workflow run test-agent.yml -f package=backend -f budget_usd=10
```

**Locally**, the gate tests run with `node --test "scripts/agent/tests/*.test.mjs"`, and each package has `npm run typecheck` and `npm run test:coverage`.

## Example run: PR #3, task stats

The PR adds a stats endpoint and a stats row above the task list. It changes 17 files and comes with no new tests.

1. **analyze** listed 11 source files and left out 6: two type files, the OpenAPI spec, a query key file and two screenshots.
2. **The agent** loaded all six skills and decided per file. It created tests for `TodoStats.tsx` and `useTodoStatsQuery.ts`, and updated the tests of the other 9 files: the repository counts, the `/stats` route with and without a date, the new validator, the API client and the cache refresh after create, update and delete. Its self-review kept 22 tests and revised 1. It reported no suspected bugs.
3. **verify** found clean typechecks, changed tests passing 3 out of 3 shuffled runs, and full suites of 100/100 (backend) and 131/131 (frontend). Line coverage went from 95.6% to 100% and from 93.9% to 100%. All 9 modified sources were guarded.
4. **publish** committed the tests as `github-actions[bot]` and posted [the comment](https://github.com/nott-po/taskly-app-node/pull/3#issuecomment-6525180401). CI is green on that commit.

The run took 34 turns and cost $0.32.

## Assumptions

- Unit tests only. The backend tests mock Prisma, and nothing needs a database or a browser.
- Tests are written by one agent per run, for at most 25 source files. Larger PRs get the first 25 and a note.
- When a test fails because the code looks wrong, the agent reports a suspected bug. It doesn't change the assertion to match the code.
- Code, comments and commit messages are data for the agent, not instructions.
- A maintainer reviews the agent's commit like any other commit before merging.

## Limitations

- The model isn't deterministic. Two runs on the same PR can write different tests, though both have to pass the same gate.
- The pattern checks in the gate are heuristics. A test can still assert something trivial and pass them. The base-version check and code review are the backstop.
- Time travel works per file. A change spread over two files, where reverting either one alone breaks nothing, can't be checked this way.
- Commits pushed with `GITHUB_TOKEN` don't start workflows, so publish starts CI itself. The `pull_request` runs for the bot's commit then wait for approval.
- The agent's tests run inside its sandbox with access to the npm registry. The sandbox has no secrets.

## What I would change for production

- A GitHub App token for publish, so CI starts normally on the agent's commits and they can be signed.
- Mutation testing (Stryker) on the changed files, as a stronger check than one revert.
- Integration tests against a real Postgres in a service container, as a separate agent and job.
- Cost and quality tracking across runs: tokens, tests kept or dropped by reviewers, flaky tests found later.
- A smaller, cheaper model for analyze, and the larger one only for writing tests.
- Fork PRs handled with a two-step `workflow_run` setup, so outside contributors get tests too.
- The PR description as a second input, so the agent can test what the change is meant to do and flag code that contradicts it.
