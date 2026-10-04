import Transport from 'winston-transport';
import { logger } from '../../src/config/logger';

/** A winston transport that keeps log entries in memory so tests can assert on them. */
class MemoryTransport extends Transport {
  entries: Record<string, unknown>[] = [];
  log(info: Record<string, unknown>, callback: () => void): void {
    this.entries.push(info);
    callback();
  }
}

/** Swap the logger's output for an in-memory capture. Call the returned restore() afterwards. */
export function captureLogs() {
  const memory = new MemoryTransport();
  const originalTransports = [...logger.transports];
  const wasSilent = logger.silent;

  logger.clear();
  logger.add(memory);
  logger.silent = false;

  return {
    entries: memory.entries,
    restore() {
      logger.clear();
      originalTransports.forEach((t) => logger.add(t));
      logger.silent = wasSilent;
    },
  };
}
