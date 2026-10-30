import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'
import type { TodoStats as Stats } from '../types'
import { TodoStats } from './TodoStats'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useTodoStatsQuery', () => ({ useTodoStatsQuery: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

function setup(state: { data?: Stats; isPending?: boolean; isError?: boolean }) {
  vi.mocked(useTodoStatsQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    ...state,
  } as unknown as ReturnType<typeof useTodoStatsQuery>)
  return render(<TodoStats />)
}

it('renders nothing while loading', () => {
  const { container } = setup({ isPending: true })
  expect(container).toBeEmptyDOMElement()
})

it('tells the user when the statistics are unavailable', () => {
  setup({ isError: true })
  expect(screen.getByText('Task statistics are unavailable.')).toBeVisible()
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

it('renders nothing when there are no tasks', () => {
  const { container } = setup({
    data: { total: 0, completed: 0, active: 0, overdue: 0 },
  })
  expect(container).toBeEmptyDOMElement()
})

it('shows the counts and hides the overdue badge when nothing is overdue', () => {
  setup({ data: { total: 3, completed: 1, active: 2, overdue: 0 } })
  const region = screen.getByRole('region', { name: 'Task statistics' })
  expect(region).toHaveTextContent('3 tasks')
  expect(region).toHaveTextContent('2 active')
  expect(region).toHaveTextContent('1 completed')
  expect(region).not.toHaveTextContent('overdue')
})

it('uses the singular for one task and shows the overdue count', () => {
  setup({ data: { total: 1, completed: 0, active: 1, overdue: 1 } })
  const region = screen.getByRole('region', { name: 'Task statistics' })
  expect(region).toHaveTextContent('1 task')
  expect(region).not.toHaveTextContent('1 tasks')
  expect(region).toHaveTextContent('1 overdue')
})
