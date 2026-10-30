import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const base: Todo = {
  id: 1,
  title: 'Alpha',
  description: '',
  priority: 'low',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}
const done: Todo = { ...base, id: 2, title: 'Beta', completed: true, priority: 'high' }

it('starts with all tasks, no search and newest sort', () => {
  const { result } = renderHook(() => useTodoFilters([base, done]))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([done, base])
})

it('applies the status filter', () => {
  const { result } = renderHook(() => useTodoFilters([base, done]))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([base])
})

it('applies the search text', () => {
  const { result } = renderHook(() => useTodoFilters([base, done]))
  act(() => result.current.setSearch('bet'))
  expect(result.current.search).toBe('bet')
  expect(result.current.visible).toEqual([done])
})

it('applies the sort order', () => {
  const { result } = renderHook(() => useTodoFilters([base, done]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([done, base])
})

it('recomputes visible tasks when the input list changes', () => {
  const { result, rerender } = renderHook(({ todos }) => useTodoFilters(todos), {
    initialProps: { todos: [base] },
  })
  rerender({ todos: [] })
  expect(result.current.visible).toEqual([])
})
