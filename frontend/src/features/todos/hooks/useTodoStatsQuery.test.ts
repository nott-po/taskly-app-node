import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodoStatsQuery } from './useTodoStatsQuery'

vi.mock('../api/todos', () => ({ todosApi: { stats: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, ...renderHook(() => useTodoStatsQuery(), { wrapper }) }
}

it('fetches stats for the local date and caches them under a date-scoped key', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00'))
  const stats = { total: 2, completed: 1, active: 1, overdue: 0 }
  vi.mocked(todosApi.stats).mockResolvedValue(stats)
  const { client, result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual(stats)
  expect(todosApi.stats).toHaveBeenCalledWith(
    '2026-10-15',
    expect.any(AbortSignal),
  )
  expect(client.getQueryData([...todoKeys.stats, '2026-10-15'])).toEqual(stats)
})

it('exposes an error when the request fails', async () => {
  vi.mocked(todosApi.stats).mockRejectedValue(new Error('Nope'))
  const { result } = setup()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Nope')
})
