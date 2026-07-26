import { createApplication } from './gateway/app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);
const application = createApplication(config, logger);

let shutdownPromise: Promise<void> | undefined;
const shutdown = (signal: NodeJS.Signals) => {
  shutdownPromise ??= application
    .stop()
    .then(() => {
      logger.info({ event: 'shutdown_complete', signal }, 'Graceful shutdown complete');
    })
    .catch((error: unknown) => {
      logger.error({ err: error, event: 'shutdown_failed', signal }, 'Graceful shutdown failed');
      process.exitCode = 1;
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

try {
  await application.start();
} catch (error) {
  logger.fatal({ err: error, event: 'startup_failed' }, 'Server failed to start');
  process.exitCode = 1;
  await application.stop().catch(() => undefined);
}
