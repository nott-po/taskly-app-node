import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      completed: false,
    })
  })
})

describe('TodoForm fields and state', () => {
  function setup(props: Partial<Parameters<typeof TodoForm>[0]> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy={false}
        error={null}
        {...props}
      />,
    )
    return { user: userEvent.setup(), onSubmit, onCancel }
  }

  it('submits description and due date, trimming the description', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText(/Task title/), 'Plan')
    await user.type(screen.getByLabelText(/Description/), '  Notes  ')
    await user.type(screen.getByLabelText(/Due date/), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Plan',
      description: 'Notes',
      priority: 'medium',
      due_date: '2026-11-02',
      completed: false,
    })
  })

  it('sends a null due date after the date is cleared', async () => {
    const { user, onSubmit } = setup({
      initial: {
        title: 'Plan',
        description: '',
        priority: 'low',
        due_date: '2026-11-02',
        completed: true,
      },
    })
    expect(screen.getByLabelText(/Due date/)).toHaveValue('2026-11-02')
    await user.clear(screen.getByLabelText(/Due date/))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Plan',
      description: '',
      priority: 'low',
      due_date: null,
      completed: true,
    })
  })

  it('shows description errors and does not submit', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText(/Task title/), 'Plan')
    await user.click(screen.getByLabelText(/Description/))
    await user.paste('a'.repeat(2001))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(
      screen.getByText('The description must be at most 2000 characters.'),
    ).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the server error and forwards cancel', async () => {
    const { user, onCancel } = setup({ error: 'Server said no.' })
    expect(screen.getByTestId('alert')).toHaveTextContent('Server said no.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables the form and shows a saving label while busy', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText(/Task title/)).toBeDisabled()
    expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  })
})
