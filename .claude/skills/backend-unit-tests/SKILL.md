---
name: backend-unit-tests
description: Conventions and patterns for unit tests in backend/ (Express 5, Prisma 7, Zod 4, Vitest, Supertest). Use when writing or updating any test under backend/tests.
---

# Backend unit tests

Location and naming: `backend/tests/<module>.test.ts`, flat, one file per source module (`src/core/config.ts` → `tests/config.test.ts`). Shared data lives in `backend/tests/fixture.ts` (`record` is a Prisma row, `todo` is the API shape). Reuse it, and extend it only when a new shape is needed.

Imports use the `.ts` extension, as in the existing tests: `import { createApp } from '../src/factory.ts'`. Import `it`, `expect`, `vi`, `describe` and hooks from `vitest` explicitly. There are no globals.

Style: short `it` blocks named after the behaviour ("rejects a title longer than 120 characters"), `it.each` for input tables, and a local `setup()` factory instead of shared mutable state. Keep the dense style of `tests/router.test.ts`.

## Never touch a real database or the network

Tests run without PostgreSQL and without `.env`.
- **Routers**: build a fake `TodoStore` with `vi.fn()` per method and mount the router on a fresh `express()` with `express.json()`, then call it with Supertest. See `tests/router.test.ts`.
- **Repository**: pass an object shaped like `Pick<Database, 'todo'>` with `vi.fn()` methods, and assert on the Prisma arguments and the mapped result. See `tests/repository.test.ts`.
- **App factory** (`createApp`): pass a fake database `{ todo: { findFirst: vi.fn(), ... } } as unknown as Database`. It reads `openapi.json` from disk, which is fine.
- **Modules with side effects at import** (`core/config.ts` calls `dotenv.config`, `core/database.ts` constructs Prisma, `core/lifespan.ts` listens on a port): use `vi.mock('dotenv', ...)`, `vi.mock('../src/core/database.ts', ...)` etc. and import the module under test after mocking. Use `vi.stubEnv` for environment variables and `vi.unstubAllEnvs()` in `afterEach`.
- **Process-level code**: spy on `process.once`, `process.exit` and `console.error` with `vi.spyOn(...).mockImplementation(...)`, and restore them in `afterEach(() => vi.restoreAllMocks())`.

## What to assert

- Status code and body for every route outcome: success, 404 `{ detail: 'Task not found.' }`, 422 with `detail` issues, and that the store isn't called after a validation failure.
- Error handler branches in `factory.ts`: malformed JSON → 422 `Invalid JSON.`, oversized body → 413, unknown route → 404, a thrown error → 500 without leaking the message, and `x-powered-by` absent.
- Zod rules at their boundaries: 1 and 120 characters pass, 0 (after trim) and 121 fail; 2000/2001 for the description; `2026-02-30` is rejected; `strictObject` rejects unknown keys; the update schema rejects `{}`.
- Dates: the API exposes `YYYY-MM-DD` for `due_date` and ISO strings for timestamps. Pin time with `vi.useFakeTimers()` and `vi.setSystemTime(...)` when code calls `new Date()`.

See [examples.md](examples.md) for ready-made patterns.
