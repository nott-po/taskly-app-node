import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useUpdateTodoMutation(), { wrapper }) }
}

it('replaces only the matching task in the cached list', async () => {
  const { client, result } = setup()
  const other = { ...todoFixture, id: 1 }
  const saved = { ...todoFixture, completed: true }
  client.setQueryData(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  await act(() =>
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('invalidates the cached stats after updating a task', async () => {
  const { client, result } = setup()
  client.setQueryData([...todoKeys.stats, '2026-10-15'], { total: 1 })
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  await act(() => result.current.mutateAsync({ id: 7, input: {} }))
  expect(
    client.getQueryState([...todoKeys.stats, '2026-10-15'])?.isInvalidated,
  ).toBe(true)
})

it('keeps an empty cache undefined', async () => {
  const { client, result } = setup()
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  await act(() => result.current.mutateAsync({ id: 7, input: {} }))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cache and exposes the error when the update fails', async () => {
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Nope'))
  await act(() =>
    result.current.mutateAsync({ id: 7, input: {} }).catch(() => undefined),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
})
