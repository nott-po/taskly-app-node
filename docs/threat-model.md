# Threat model: the test agent workflow

## What is worth protecting

| Asset | Where it lives |
| --- | --- |
| `ANTHROPIC_API_KEY` | Repository secret, available only to the `generate` job |
| Write access to the repository | The `GITHUB_TOKEN` of the `publish` job (`contents`, `pull-requests`, `actions: write`) |
| The rules that judge the agent | `.claude/`, `scripts/agent/`, `.github/workflows/` |
| The PR branch | Receives only commits that passed `verify` |

## Who can attack, and how

1. **A PR author or a malicious dependency** puts code in the PR that runs during tests (a test, a Vitest config, a `postinstall` script).
2. **Prompt injection.** The diff, code comments or PR text tell the agent to do something else: edit source, leak the key, skip tests.
3. **A confused model** writes a test that passes without checking anything, or changes files it shouldn't.
4. **A fork PR** tries to get secrets or a write token.

## Controls

| Threat | Control | Where |
| --- | --- | --- |
| PR code reads the API key | The key is only in `generate`. Claude Code strips it from every subprocess (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`) and runs commands in a bubblewrap sandbox. `npm ci --ignore-scripts` | `test-agent.yml` |
| PR code exfiltrates data | `harden-runner` blocks egress in `generate` except the Anthropic API, npm, GitHub and Ubuntu mirrors, and in `verify` except npm and GitHub. The agent has no `curl`, `wget`, `npm`, `npx`, `node`, `WebFetch` or `WebSearch` | `test-agent.yml`, `.claude/test-agent.settings.json` |
| PR code gets write access | `publish` holds the write token and never installs or runs PR code. It applies a text patch and calls `git` and `gh` only. `persist-credentials: false` everywhere | `test-agent.yml` |
| A PR rewrites the agent or its gate | `.claude/` and `scripts/agent/` are restored from the base branch before anything runs. The PR's copies are deleted first. CODEOWNERS and a branch rule on `main` (pull requests, code-owner review, required CI checks) cover them | `test-agent.yml`, `.github/CODEOWNERS`, branch protection |
| The agent edits non-test files | Three independent checks: permission rules, a `PreToolUse` hook (`guard-paths.mjs`), and `validate-patch.mjs` on the patch and again on the files on disk after `git apply` | `scripts/agent/` |
| Tests that prove nothing | The patch is rejected for `.only/.skip/.todo/.fails`, snapshots, `process.env` writes, network or `child_process` imports and `process.exit`. Every test runs under `expect.hasAssertions()`. Changed tests run 3 times in random order. Time travel: each modified source must have a test that fails on its base version | `validate-patch.mjs`, `verify.mjs` |
| Prompt injection | The prompt marks the manifest, diff and code as data. The agent reports instructions it finds and doesn't follow them. Even if it did follow them, the controls above limit the result to test files that pass `verify` | agent definition, `test-agent.yml` |
| Agent text abused in the PR comment | HTML, links, images and `@mentions` are stripped from everything the agent wrote | `render-comment.mjs` |
| Fork PRs | `pull_request` (never `pull_request_target`). Fork PRs get a notice and no run | `test-agent.yml` |
| Runaway cost | `--max-budget-usd`, `--max-turns`, a time limit, and a job timeout | `test-agent.yml` |
| Supply chain | Actions pinned to commit SHAs. Claude Code installed from a lockfile with integrity hashes. `actionlint` and `zizmor` in CI | `ci.yml`, `scripts/agent/runtime/` |

## Residual risks

- Test code and the PR's Vitest config run inside the agent's sandbox, which has network access to the allowlisted hosts. The sandbox has no secrets, but a test could still contact the npm registry.
- The pattern checks are heuristics. A determined author can write a weak test that passes them. Time travel and review of the PR remain the backstop.
- Someone with write access can change the workflow file in their own PR, and the `pull_request` trigger runs the PR's version of it on that PR. The change can't reach `main` without a code owner's review, but the run on the PR itself uses the edited workflow.
- `GITHUB_TOKEN` pushes don't trigger workflows, so `publish` starts CI explicitly. A GitHub App token would be cleaner (see SOLUTION.md).
