import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { closeDatabase, db } from './index.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: migrationsFolder,
    import: (filePath) => import(pathToFileURL(filePath).href),
  }),
});

try {
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    console.log(`${result.status}: ${result.migrationName}`);
  }
  if (error) throw error;
} finally {
  await closeDatabase();
}
