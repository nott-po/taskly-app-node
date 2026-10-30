import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

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
  return { client, ...renderHook(() => useDeleteTodoMutation(), { wrapper }) }
}

it('removes the deleted task from the cached list', async () => {
  const { client, result } = setup()
  const other = { ...todoFixture, id: 1 }
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('keeps an empty cache undefined', async () => {
  const { client, result } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  await act(() => result.current.mutateAsync(7))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cache and exposes the error when deletion fails', async () => {
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Nope'))
  await act(() => result.current.mutateAsync(7).catch(() => undefined))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
})
