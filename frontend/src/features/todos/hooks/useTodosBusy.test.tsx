import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup(key: readonly string[]) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const hook = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey: key,
        mutationFn: () => gate,
      }),
    }),
    { wrapper },
  )
  return { ...hook, release }
}

it('is idle without mutations', () => {
  const { result } = setup(todoKeys.update)
  expect(result.current.busy).toBe(false)
})

it('is busy while a todo mutation is pending and idle afterwards', async () => {
  const { result, release } = setup(todoKeys.update)
  let promise!: Promise<void>
  act(() => {
    promise = result.current.mutation.mutateAsync()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => {
    release()
    await promise
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores pending mutations with an unrelated key', async () => {
  const { result, release } = setup(['other'])
  let promise!: Promise<void>
  act(() => {
    promise = result.current.mutation.mutateAsync()
  })
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  await act(async () => {
    release()
    await promise
  })
})
