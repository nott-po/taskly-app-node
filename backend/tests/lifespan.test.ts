import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  initialize: vi.fn(),
  resolveDatabaseUrl: vi.fn(),
  createApp: vi.fn(),
}));
vi.mock('../src/core/database.ts', () => ({ createDatabase: mocks.createDatabase, initialize: mocks.initialize }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: mocks.resolveDatabaseUrl }));
vi.mock('../src/factory.ts', () => ({ createApp: mocks.createApp }));
const { start } = await import('../src/core/lifespan.ts');

function setup({ connect = vi.fn().mockResolvedValue(undefined), listenError }: { connect?: ReturnType<typeof vi.fn>; listenError?: Error } = {}) {
  const database = { $connect: connect, $disconnect: vi.fn().mockResolvedValue(undefined) };
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const listener = {
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers[event] = handler; }),
    address: vi.fn(() => ({ port: 1234 })),
    close: vi.fn(),
  };
  const listen = vi.fn((_port: number, _host: string, callback: () => void) => {
    Promise.resolve().then(() => (listenError ? handlers.error(listenError) : callback()));
    return listener;
  });
  mocks.createDatabase.mockReturnValue(database);
  mocks.createApp.mockReturnValue({ listen });
  return { database, listener, listen };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveDatabaseUrl.mockReturnValue('postgresql://h/d');
  mocks.initialize.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'once').mockImplementation((() => process) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  process.exitCode = undefined;
});

describe('start', () => {
  it('connects, initializes and listens on API_PORT', async () => {
    vi.stubEnv('API_PORT', '9001');
    const { database, listener, listen } = setup();
    const result = await start();
    expect(mocks.createDatabase).toHaveBeenCalledWith('postgresql://h/d');
    expect(database.$connect).toHaveBeenCalledOnce();
    expect(mocks.initialize).toHaveBeenCalledWith(database);
    expect(listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
    expect(result).toEqual({ server: listener, database });
    expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 1234');
  });
  it('defaults to port 8000', async () => {
    vi.stubEnv('API_PORT', '');
    const { listen } = setup();
    await start();
    expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
  });
  it('disconnects and rethrows when connecting fails', async () => {
    const { database } = setup({ connect: vi.fn().mockRejectedValue(new Error('no db')) });
    await expect(start()).rejects.toThrow('no db');
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(mocks.createApp).not.toHaveBeenCalled();
  });
  it('disconnects and rethrows when the server emits an error', async () => {
    const { database } = setup({ listenError: new Error('EADDRINUSE') });
    await expect(start()).rejects.toThrow('EADDRINUSE');
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });
  it('registers shutdown for SIGTERM and SIGINT that closes the server and disconnects', async () => {
    const { database, listener } = setup();
    await start();
    const calls = vi.mocked(process.once).mock.calls;
    expect(calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGINT']);
    (calls[0][1] as () => void)();
    expect(listener.close).toHaveBeenCalledOnce();
    await (listener.close.mock.calls[0][0] as () => Promise<void>)();
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
  });
  it('sets exit code 1 when disconnect fails during shutdown', async () => {
    const { database, listener } = setup();
    const failure = new Error('disconnect failed');
    await start();
    database.$disconnect.mockRejectedValue(failure);
    (vi.mocked(process.once).mock.calls[0][1] as () => void)();
    await (listener.close.mock.calls[0][0] as () => Promise<void>)();
    expect(console.error).toHaveBeenCalledWith(failure);
    expect(process.exitCode).toBe(1);
  });
  it('forces exit with code 1 when shutdown takes longer than 10 seconds', async () => {
    vi.useFakeTimers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    setup();
    await start();
    (vi.mocked(process.once).mock.calls[0][1] as () => void)();
    vi.advanceTimersByTime(9999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
