import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn(), stats: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it.each(['abc', '0', '-1', '1.5'])('rejects invalid id %s with 422 before touching the repository', async (id) => {
  const { app, repository } = setup();
  const response = await request(app).get(`/api/todos/${id}`);
  expect(response.status).toBe(422);
  expect(Array.isArray(response.body.detail)).toBe(true);
  expect(repository.get).not.toHaveBeenCalled();
});
it('gets a task by numeric id', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('returns 404 when the task does not exist on get', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/7');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('updates a task with validated input', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(todo);
  const response = await request(app).patch('/api/todos/1').send({ title: '  New  ', completed: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.update).toHaveBeenCalledWith(1, { title: 'New', completed: true });
});
it.each([{}, { title: '' }, { unknown: 1 }])('rejects invalid update input without calling the repository: %j', async (payload) => {
  const { app, repository } = setup();
  expect((await request(app).patch('/api/todos/1').send(payload)).status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
});
it('returns 404 when updating a missing task', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/9').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('deletes a task and returns 204 with no body', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(1);
});
const stats = { total: 3, completed: 1, active: 2, overdue: 1 };
it('returns stats for the date sent by the client, not read as an id', async () => {
  const { app, repository } = setup();
  repository.stats.mockResolvedValue(stats);
  const response = await request(app).get('/api/todos/stats?today=2026-10-15');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(stats);
  expect(repository.stats).toHaveBeenCalledWith('2026-10-15');
  expect(repository.get).not.toHaveBeenCalled();
});
it('defaults stats to the current UTC date', async () => {
  const { app, repository } = setup();
  repository.stats.mockResolvedValue(stats);
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-03-04T23:30:00Z'));
    expect((await request(app).get('/api/todos/stats')).status).toBe(200);
  } finally {
    vi.useRealTimers();
  }
  expect(repository.stats).toHaveBeenCalledWith('2026-03-04');
});
it.each(['?today=2026-02-30', '?today=tomorrow', '?today=', '?today=2026-10-15&extra=1'])('rejects invalid stats query %s', async (query) => {
  const { app, repository } = setup();
  const response = await request(app).get(`/api/todos/stats${query}`);
  expect(response.status).toBe(422);
  expect(Array.isArray(response.body.detail)).toBe(true);
  expect(repository.stats).not.toHaveBeenCalled();
});
it('returns 404 when deleting a missing task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(false);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
