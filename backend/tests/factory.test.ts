import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst = vi.fn().mockResolvedValue(null)) {
  const database = { todo: { findFirst, findMany: vi.fn().mockResolvedValue([]) } } as unknown as Database;
  return { app: createApp(database), findFirst };
}
afterEach(() => vi.restoreAllMocks());

describe('createApp', () => {
  it('serves health without x-powered-by', async () => {
    const response = await request(setup().app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('serves the openapi specification', async () => {
    const response = await request(setup().app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('openapi');
  });
  it('lists todos through the repository', async () => {
    const response = await request(setup().app).get('/api/todos');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
  it('returns 404 for unknown routes', async () => {
    const response = await request(setup().app).get('/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: 'Not Found' });
  });
  it('returns 422 for malformed JSON', async () => {
    const response = await request(setup().app).post('/api/todos').set('content-type', 'application/json').send('{bad');
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  });
  it('returns 413 for an oversized body', async () => {
    const response = await request(setup().app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ detail: 'Request body too large.' });
  });
  it('returns 500 without leaking the error message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(setup(vi.fn().mockRejectedValue(new Error('secret'))).app).get('/api/health');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ detail: 'Internal Server Error' });
    expect(response.text).not.toContain('secret');
    expect(error).toHaveBeenCalledOnce();
  });
});
