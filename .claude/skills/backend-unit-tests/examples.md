# Backend test patterns

## Router with a fake store

```ts
import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('returns 404 when the task does not exist', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/5');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
  expect(repository.get).toHaveBeenCalledWith(5);
});
```

## Module with import-time side effects

```ts
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
const { resolveDatabaseUrl } = await import('../src/core/config.ts');

afterEach(() => vi.unstubAllEnvs());

it('rejects a missing variable by name', () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_USER', '');
  expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_USER');
});
```

## Mocked collaborators for startup code

```ts
const database = { $connect: vi.fn(), $disconnect: vi.fn() };
vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(() => database), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn(() => 'postgresql://test') }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));
```

Make `createApp` return an object whose `listen(port, host, callback)` returns a fake server built on `EventEmitter`, so both the success callback and the `'error'` event can be triggered.

## App factory error handling

```ts
const app = createApp({ todo: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as Database);
const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
expect(response.status).toBe(422);
expect(response.body).toEqual({ detail: 'Invalid JSON.' });
```
