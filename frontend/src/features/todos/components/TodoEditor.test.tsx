import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
    error,
    initial,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
    error: string | null
    initial?: { title: string }
  }) => (
    <>
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      <span>{`error: ${error}`}</span>
      <span>{`initial: ${initial?.title ?? 'none'}`}</span>
    </>
  ),
}))

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

type Mutation = { isPending?: boolean; error?: Error | null; mutateAsync?: unknown }

function setup(
  todo: Parameters<typeof TodoEditor>[0]['todo'],
  opts: { busy?: boolean; create?: Mutation; update?: Mutation } = {},
) {
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn().mockResolvedValue(todoFixture)
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
    ...opts.create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
    ...opts.update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todo}
      busy={opts.busy ?? false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  return { user: userEvent.setup(), create, update, onSaved }
}

it('updates an existing task and reports saved changes', async () => {
  const { user, create, update, onSaved } = setup(todoFixture)
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(screen.getByText(`initial: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({ id: todoFixture.id, input: todoFixture })
  expect(create).not.toHaveBeenCalled()
})

it('starts a new task without initial values', () => {
  setup('new')
  expect(screen.getByText('initial: none')).toBeVisible()
  expect(screen.getByText('error: null')).toBeVisible()
})

it('does not report a save when the update fails and shows its error', async () => {
  const failing = vi.fn().mockRejectedValue(new Error('x'))
  const { user, onSaved } = setup(todoFixture, {
    update: { mutateAsync: failing, error: new Error('Update failed.') },
  })
  expect(screen.getByText('error: Update failed.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(failing).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it('shows the create error only in new mode', () => {
  setup('new', { create: { error: new Error('Create failed.') } })
  expect(screen.getByText('error: Create failed.')).toBeVisible()
})

it.each([
  ['busy from the parent', { busy: true }],
  ['a pending create', { create: { isPending: true } }],
])('ignores submits during %s', async (_, opts) => {
  const { user, create, onSaved } = setup('new', opts)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})
