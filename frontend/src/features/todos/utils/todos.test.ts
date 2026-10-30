import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const input: TodoInput = {
  title: 'Task',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

afterEach(() => vi.useRealTimers())

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('keeps only completed tasks for the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('breaks priority ties by newest id', () => {
    const other = { ...base, id: 2 }
    expect(selectTodos([base, other], 'all', '', 'priority')).toEqual([
      other,
      base,
    ])
  })

  it('sorts by due date with undated tasks last and ties by id', () => {
    const undated = { ...base, id: 1 }
    const late = { ...base, id: 2, due_date: '2026-12-01' }
    const early = { ...base, id: 3, due_date: '2026-11-01' }
    const early2 = { ...base, id: 4, due_date: '2026-11-01' }
    expect(
      selectTodos([undated, late, early, early2], 'all', '', 'due'),
    ).toEqual([early2, early, late, undated])
  })

  it('sorts newest first by creation time and then by id', () => {
    const newer = { ...base, id: 2, created_at: '2026-10-02T12:00:00Z' }
    const same = { ...base, id: 3 }
    expect(selectTodos([base, newer, same], 'all', '', 'newest')).toEqual([
      newer,
      same,
      base,
    ])
  })
})

describe('validateTodo', () => {
  it('accepts a valid task', () => {
    expect(validateTodo(input)).toEqual({})
  })

  it.each([
    ['', 'Enter a task title.'],
    ['   ', 'Enter a task title.'],
    ['a'.repeat(201), 'The title must be at most 200 characters.'],
  ])('rejects title %j', (title, message) => {
    expect(validateTodo({ ...input, title })).toEqual({ title: message })
  })

  it('accepts a title of exactly 200 characters after trimming', () => {
    expect(validateTodo({ ...input, title: ` ${'a'.repeat(200)} ` })).toEqual(
      {},
    )
  })

  it('limits the description to 2000 characters', () => {
    expect(
      validateTodo({ ...input, description: 'a'.repeat(2000) }),
    ).toEqual({})
    expect(
      validateTodo({ ...input, description: 'a'.repeat(2001) }),
    ).toEqual({ description: 'The description must be at most 2000 characters.' })
  })

  it.each(['2026-02-30', '2026-13-01', '26-01-01', 'tomorrow', '2026-1-1'])(
    'rejects the due date %s',
    (due_date) => {
      expect(validateTodo({ ...input, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('accepts a real calendar date including leap day', () => {
    expect(validateTodo({ ...input, due_date: '2028-02-29' })).toEqual({})
  })

  it('reports several errors at once', () => {
    expect(
      validateTodo({ ...input, title: '', due_date: '2026-02-30' }),
    ).toEqual({ title: 'Enter a task title.', due_date: 'Enter a valid date.' })
  })
})

describe('isOverdue', () => {
  function at(date: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(date))
  }

  it('is true for an open task due before today', () => {
    at('2026-10-15T12:00:00')
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
  })

  it('is false for a task due today or later', () => {
    at('2026-10-15T12:00:00')
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
  })

  it('is false for completed or undated tasks', () => {
    at('2026-10-15T12:00:00')
    expect(
      isOverdue({ ...base, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
    expect(isOverdue(base)).toBe(false)
  })

  it('pads single digit months and days', () => {
    at('2026-03-05T12:00:00')
    expect(isOverdue({ ...base, due_date: '2026-03-04' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2026-03-05' })).toBe(false)
  })
})

describe('formatDate and labels', () => {
  it('formats a date in en-GB style', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })

  it('exposes labels for every priority', () => {
    expect(priorityLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    })
  })
})
