import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import type { Logger } from '../application/ports/Logger.js';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { closeOnSignals, disposeWithApp } from './lifecycle.js';

const silentLogger = (): Logger => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });

describe('disposeWithApp', () => {
  it('destroys the database when the app closes', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const app = buildApp(buildDependencies(db, silentLogger()), { cookieSecret: 'test-secret' });
    disposeWithApp(app, db);
    await expect(sql`select 1`.execute(db)).resolves.toBeDefined();

    await app.close();

    await expect(sql`select 1`.execute(db)).rejects.toThrow(/destroyed/);
  });
});

describe('closeOnSignals', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('closes the app on %s', async (signal) => {
    const signals = new EventEmitter();
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const logger = silentLogger();
    closeOnSignals(app, logger, signals);

    signals.emit(signal);

    expect(app.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(logger.logInfo).toHaveBeenCalledWith('server_closed'));
  });

  it('handles each signal once, so a second Ctrl-C falls through to the default', () => {
    const signals = new EventEmitter();
    closeOnSignals({ close: vi.fn().mockResolvedValue(undefined) }, silentLogger(), signals);

    signals.emit('SIGINT');

    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('logs a failed close and sets a failing exit code', async () => {
    const signals = new EventEmitter();
    const logger = silentLogger();
    const previousExitCode = process.exitCode;
    closeOnSignals({ close: vi.fn().mockRejectedValue(new Error('stuck')) }, logger, signals);

    signals.emit('SIGTERM');

    await vi.waitFor(() => expect(logger.logError).toHaveBeenCalledWith('shutdown_failed', expect.objectContaining({ error: 'stuck' })));
    expect(process.exitCode).toBe(1);
    process.exitCode = previousExitCode;
  });
});
