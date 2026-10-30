import { expect, it, vi } from 'vitest';

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }));
vi.mock('../src/generated/prisma/client.js', () => ({ PrismaClient: vi.fn() }));
const { initialize, createDatabase } = await import('../src/core/database.ts');
const { PrismaPg } = await import('@prisma/adapter-pg');
const { PrismaClient } = await import('../src/generated/prisma/client.js');

it('creates the todos table if missing', async () => {
  const $executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw } as never);
  expect($executeRaw).toHaveBeenCalledOnce();
  expect($executeRaw.mock.calls[0][0].join('')).toContain('CREATE TABLE IF NOT EXISTS todos');
});
it('propagates initialization errors', async () => {
  const $executeRaw = vi.fn().mockRejectedValue(new Error('boom'));
  await expect(initialize({ $executeRaw } as never)).rejects.toThrow('boom');
});
it('creates a client with a pg adapter for the connection string', () => {
  createDatabase('postgresql://h/d');
  expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://h/d', connectionTimeoutMillis: 10000 });
  expect(PrismaClient).toHaveBeenCalledOnce();
});
