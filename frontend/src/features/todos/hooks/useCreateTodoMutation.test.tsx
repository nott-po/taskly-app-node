import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const input: TodoInput = {
  title: todoFixture.title,
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useCreateTodoMutation(), { wrapper }) }
}

it('prepends the saved task to the cached list', async () => {
  const { client, result } = setup()
  const older = { ...todoFixture, id: 1 }
  client.setQueryData(todoKeys.list, [older])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  await act(() => result.current.mutateAsync(input))
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, older])
})

it('creates the list from an empty cache', async () => {
  const { client, result } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('replaces a cached task that has the same id instead of duplicating it', async () => {
  const { client, result } = setup()
  const other = { ...todoFixture, id: 1 }
  client.setQueryData(todoKeys.list, [other, { ...todoFixture, title: 'Old' }])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('leaves the cache untouched and exposes the error when creation fails', async () => {
  const { client, result } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Nope'))
  await act(() => result.current.mutateAsync(input).catch(() => undefined))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await waitFor(() => expect(result.current.error?.message).toBe('Nope'))
})
