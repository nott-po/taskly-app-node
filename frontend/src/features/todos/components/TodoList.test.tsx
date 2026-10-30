import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({
    hasTodos,
    disabled,
    onCreate,
  }: {
    hasTodos: boolean
    disabled: boolean
    onCreate: () => void
  }) => (
    <button disabled={disabled} onClick={onCreate}>
      {`Empty task list ${hasTodos ? 'filtered' : 'blank'}`}
    </button>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      <span>{`Task ${todo.id} ${busy ? 'busy' : 'idle'}`}</span>
      <button onClick={onToggle}>{`toggle ${todo.id}`}</button>
      <button onClick={onEdit}>{`edit ${todo.id}`}</button>
      <button onClick={onDelete}>{`delete ${todo.id}`}</button>
    </li>
  ),
}))

const props = {
  todos: [] as Todo[],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText(/Empty task list/)).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list blank')).toBeVisible()
})

it('shows the unavailable message when loading failed and nothing is cached', () => {
  render(<TodoList {...props} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
})

it('keeps showing cached tasks when a refetch failed', () => {
  render(<TodoList {...props} failed hasTodos todos={[todoFixture]} />)
  expect(screen.getByText('Task 7 idle')).toBeVisible()
  expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument()
})

it('tells the empty state when tasks exist but none match the filters', () => {
  render(<TodoList {...props} hasTodos busy />)
  expect(screen.getByRole('button', { name: 'Empty task list filtered' })).toBeDisabled()
})

it('forwards create from the empty state', async () => {
  const onCreate = vi.fn()
  render(<TodoList {...props} onCreate={onCreate} />)
  await userEvent.setup().click(screen.getByRole('button'))
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('renders each task and forwards its actions with the task', async () => {
  const user = userEvent.setup()
  const other = { ...todoFixture, id: 8 }
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...props}
      hasTodos
      busy
      todos={[todoFixture, other]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('Task 8 busy')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'toggle 8' }))
  await user.click(screen.getByRole('button', { name: 'edit 7' }))
  await user.click(screen.getByRole('button', { name: 'delete 8' }))
  expect(onToggle).toHaveBeenCalledWith(other)
  expect(onEdit).toHaveBeenCalledWith(todoFixture)
  expect(onDelete).toHaveBeenCalledWith(other)
})
