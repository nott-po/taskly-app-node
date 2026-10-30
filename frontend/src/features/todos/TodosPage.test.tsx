import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import type { Todo } from './types'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    onCreate,
  }: {
    disabled: boolean
    onCreate: () => void
  }) => (
    <button disabled={disabled} onClick={onCreate}>
      New
    </button>
  ),
}))
vi.mock('./components/TodoFilters', () => ({
  TodoFilters: ({
    onFilterChange,
    onSearchChange,
    onSortChange,
  }: {
    onFilterChange: (value: string) => void
    onSearchChange: (value: string) => void
    onSortChange: (value: string) => void
  }) => (
    <>
      <button onClick={() => onFilterChange('done')}>filter</button>
      <button onClick={() => onSearchChange('q')}>search</button>
      <button onClick={() => onSortChange('due')}>sort</button>
    </>
  ),
}))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    hasTodos,
    loading,
    failed,
    busy,
    onCreate,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todos: Todo[]
    hasTodos: boolean
    loading: boolean
    failed: boolean
    busy: boolean
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <p>{`list ${todos.length} has=${hasTodos} loading=${loading} failed=${failed} busy=${busy}`}</p>
      <button onClick={onCreate}>list create</button>
      <button onClick={() => onToggle(todoFixture)}>toggle</button>
      <button onClick={() => onEdit(todoFixture)}>edit</button>
      <button onClick={() => onDelete(todoFixture)}>delete</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div role="dialog" aria-label="editor">
      <p>{`editing ${todo === 'new' ? 'new' : todo.id}`}</p>
      <button onClick={onClose}>editor close</button>
      <button onClick={() => onSaved('Saved!')}>editor save</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div role="dialog" aria-label="delete">
      <p>{`deleting ${todo.id}`}</p>
      <button onClick={onClose}>delete close</button>
      <button onClick={onDeleted}>delete confirm</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))
vi.mock('./components/TodoStats', () => ({ TodoStats: () => <p>stats</p> }))

function setup(
  opts: {
    query?: object
    mutation?: object
    busy?: boolean
    data?: Todo[]
  } = {},
) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const mutateAsync = vi.fn().mockResolvedValue({ ...todoFixture, completed: true })
  const notify = vi.fn()
  const filters = {
    filter: 'all' as const,
    search: '',
    sort: 'newest' as const,
    visible: [] as Todo[],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  }
  vi.mocked(useTodosQuery).mockReturnValue({
    data: opts.data,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch,
    ...opts.query,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync,
    ...opts.mutation,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(opts.busy ?? false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue(filters)
  render(<TodosPage />)
  return { user: userEvent.setup(), refetch, reset, mutateAsync, notify, filters }
}

beforeEach(() => vi.clearAllMocks())

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('treats a missing query result as an empty list and shows no alert', () => {
  setup()
  expect(
    screen.getByText('list 0 has=false loading=false failed=false busy=false'),
  ).toBeVisible()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
})

it('shows the task statistics on the page', () => {
  setup()
  expect(screen.getByText('stats')).toBeVisible()
})

it('passes loading, failure and cached-task state to the list', () => {
  setup({
    data: [todoFixture],
    query: { isPending: true, isError: true, error: new Error('x') },
    busy: true,
  })
  expect(
    screen.getByText('list 0 has=true loading=true failed=true busy=true'),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'New' })).toBeDisabled()
})

it('prefers the mutation error over the query error and disables retry while fetching', () => {
  setup({
    query: { error: new Error('query'), isFetching: true },
    mutation: { error: new Error('mutation') },
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('mutation')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('query')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('forwards filter, search and sort changes', async () => {
  const { user, filters } = setup()
  await user.click(screen.getByRole('button', { name: 'filter' }))
  await user.click(screen.getByRole('button', { name: 'search' }))
  await user.click(screen.getByRole('button', { name: 'sort' }))
  expect(filters.setFilter).toHaveBeenCalledWith('done')
  expect(filters.setSearch).toHaveBeenCalledWith('q')
  expect(filters.setSort).toHaveBeenCalledWith('due')
})

it('marks a task complete and congratulates the user', async () => {
  const { user, mutateAsync, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
  expect(notify).toHaveBeenCalledWith('Another task complete. Well done!')
})

it('reports a task marked as active again', async () => {
  const { user, mutateAsync, notify } = setup()
  mutateAsync.mockResolvedValue({ ...todoFixture, completed: false })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(notify).toHaveBeenCalledWith('Task marked as active.')
})

it('does not notify when toggling fails', async () => {
  const { user, mutateAsync, notify } = setup()
  mutateAsync.mockRejectedValue(new Error('x'))
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while busy', async () => {
  const { user, mutateAsync, notify } = setup({ busy: true })
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the header and the list, then closes it', async () => {
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'New' }))
  expect(screen.getByText('editing new')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'editor close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'list create' }))
  expect(screen.getByText('editing new')).toBeVisible()
})

it('edits a task and shows the saved notice after closing the editor', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'edit' }))
  expect(screen.getByText(`editing ${todoFixture.id}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'editor save' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Saved!')
})

it('confirms a deletion, closes the dialog and notifies', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'delete' }))
  expect(screen.getByText(`deleting ${todoFixture.id}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'delete confirm' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete dialog without notifying when cancelled', async () => {
  const { user, notify } = setup()
  await user.click(screen.getByRole('button', { name: 'delete' }))
  await user.click(screen.getByRole('button', { name: 'delete close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
