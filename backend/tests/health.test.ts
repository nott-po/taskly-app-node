import express from 'express';
import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst = vi.fn().mockResolvedValue(null)) {
  const app = express();
  app.use('/api', createHealthRouter({ todo: { findFirst } } as unknown as Database));
  return { app, findFirst };
}
afterEach(() => vi.restoreAllMocks());

it('returns ok after querying the database', async () => {
  const { app, findFirst } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
it('returns 500 when the database query fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { app } = setup(vi.fn().mockRejectedValue(new Error('down')));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
});
