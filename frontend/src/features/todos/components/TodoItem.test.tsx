import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

afterEach(() => vi.useRealTimers())

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

function setup(todo = todoFixture, busy = false) {
  const handlers = { onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }
  render(<TodoItem todo={todo} busy={busy} {...handlers} />)
  return { user: userEvent.setup(), ...handlers }
}

it('shows description, completed state and forwards toggle and delete', async () => {
  const { user, onToggle, onDelete } = setup({
    ...todoFixture,
    description: 'Line one',
    completed: true,
    priority: 'high',
  })
  expect(screen.getByText('Line one')).toBeVisible()
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todoFixture.title}`,
  })
  expect(checkbox).toBeChecked()
  await user.click(checkbox)
  expect(onToggle).toHaveBeenCalledTimes(1)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('omits the description and labels the checkbox "Complete" for an open task', () => {
  setup()
  expect(screen.queryByText('Line one')).not.toBeInTheDocument()
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeVisible()
})

it('disables every action while busy', () => {
  setup(todoFixture, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('marks an open task with a past due date as overdue', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00'))
  setup({ ...todoFixture, due_date: '2026-10-14' })
  expect(screen.getByText(/14 Oct 2026 · overdue/)).toBeVisible()
})

it('shows a future due date without the overdue marker', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00'))
  setup({ ...todoFixture, due_date: '2026-10-20' })
  expect(screen.getByText('20 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})
