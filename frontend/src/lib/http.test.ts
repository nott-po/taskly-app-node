import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

function setup(response: Response | Error) {
  fetchMock.mockReset()
  if (response instanceof Error) fetchMock.mockRejectedValue(response)
  else fetchMock.mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
}

afterEach(() => vi.unstubAllGlobals())

it('prefixes the path with /api and merges headers', async () => {
  setup(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Test': 'a' } }),
  ).resolves.toEqual({ ok: 1 })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test': 'a' },
  })
})

it('returns undefined for 204 responses', async () => {
  setup(new Response(null, { status: 204 }))
  await expect(request('/todos/1')).resolves.toBeUndefined()
})

it('throws a friendly message for 422 responses', async () => {
  setup(new Response(JSON.stringify({ detail: 'raw' }), { status: 422 }))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('throws the string detail of an error response', async () => {
  setup(new Response(JSON.stringify({ detail: 'Task not found.' }), { status: 404 }))
  await expect(request('/todos/1')).rejects.toThrow('Task not found.')
})

it.each([
  ['a non-string detail', JSON.stringify({ detail: [1] })],
  ['a non-JSON body', 'oops'],
  ['a null JSON body', 'null'],
])('throws the generic message for %s', async (_, body) => {
  setup(new Response(body, { status: 500 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('reports a connection problem when fetch fails', async () => {
  setup(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  setup(abortError as unknown as Error)
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})
