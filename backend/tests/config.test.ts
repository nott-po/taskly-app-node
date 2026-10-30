import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
const { resolveDatabaseUrl } = await import('../src/core/config.ts');

const parts = { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'p@ss', POSTGRES_HOST: 'db', DB_PORT: '5433', POSTGRES_DB: 'my db' }
function stubParts(skip?: string) {
  vi.stubEnv('DATABASE_URL', '');
  for (const [key, value] of Object.entries(parts)) vi.stubEnv(key, key === skip ? '' : value);
}
afterEach(() => vi.unstubAllEnvs());

describe('resolveDatabaseUrl', () => {
  it('prefers the override over DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
    expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
  });
  it('uses DATABASE_URL and rewrites the psycopg scheme', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@h:5432/d');
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
  });
  it('builds the url from parts with encoding', () => {
    stubParts();
    expect(resolveDatabaseUrl()).toBe('postgresql://user:p%40ss@db:5433/my%20db');
  });
  it.each(Object.keys(parts))('throws when %s is missing', (name) => {
    stubParts(name);
    expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
  });
});
