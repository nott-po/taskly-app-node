---
name: frontend-unit-tests
description: Conventions and patterns for unit tests in frontend/ (React 19, TanStack Query 5, styled-components, Vitest, Testing Library). Use when writing or updating any *.test.ts(x) file under frontend/src.
---

# Frontend unit tests

Location: next to the source, same name plus `.test.ts` / `.test.tsx` (`hooks/useTodosQuery.ts` → `hooks/useTodosQuery.test.ts`). Shared helpers go in `frontend/src/test/`. The task fixture is `todoFixture` from `src/test/todoFixture.ts`.

The environment is jsdom with `@testing-library/jest-dom` matchers and automatic `cleanup` (see `src/test/setup.ts`). Import `it`, `expect`, `vi` and friends from `vitest` explicitly, as the existing tests do. Prettier style: no semicolons, single quotes, trailing commas.

## Components

- Mock the design system the same way every existing test does, because it keeps styled-components out of unit tests:
  `vi.mock('../../../design-system', () => import('../../../design-system/mocks'))`. Adjust the relative path. The mock `Alert` renders `data-testid="alert"` and `Drawer` renders `role="dialog"` named by its `title`.
- Query by role and accessible name first (`getByRole('button', { name: 'Delete task' })`), then by label or text. Use `getByTestId` only for the alert mock.
- Interact with `userEvent.setup()` and `await user.click(...)`, not `fireEvent`.
- Mock child components or hooks only when the test is about the parent's wiring, as `TodosPage.test.tsx` does. Assert on callbacks with `toHaveBeenCalledTimes` / `toHaveBeenCalledWith`.
- Cover every conditional render: loading, error, empty, busy/disabled, and each variant of a ternary.

## Hooks with TanStack Query

Render with a fresh client per test so cache and retries never leak between tests:

```tsx
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
```

- Mock the API module: `vi.mock('../api/todos', () => ({ todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }))`.
- Seed the cache with `client.setQueryData(todoKeys.list, [...])`, run `await act(() => result.current.mutateAsync(...))`, then assert on `client.getQueryData(todoKeys.list)`.
- Test the empty-cache case too (`undefined` stays `undefined`, or becomes `[saved]` for create) and deduplication by id.
- Use `waitFor(() => expect(result.current.isSuccess).toBe(true))` for queries.

## `lib/http.ts` and other fetch code

Stub `fetch` with `vi.stubGlobal('fetch', vi.fn())` and `vi.unstubAllGlobals()` in `afterEach`. Return `new Response(JSON.stringify(body), { status })`. Cover 2xx JSON, 204, 422, errors with and without a string `detail`, a non-JSON error body, network failure, and abort (the original error is rethrown when the signal is aborted).

## Timers

`useNotice` and similar code use `setTimeout`. Use `vi.useFakeTimers()`, `act(() => vi.advanceTimersByTime(4000))`, and `vi.useRealTimers()` in `afterEach`. Don't combine fake timers with `userEvent` unless you pass `advanceTimers: vi.advanceTimersByTime`.

See [examples.md](examples.md) for complete tests.
