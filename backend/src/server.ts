import { app } from './app.js';
import { config } from './config.js';
import { closeDatabase } from './database/index.js';

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`LifeOS API listening at http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down LifeOS API.`);
  server.close(async (error) => {
    await closeDatabase();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
