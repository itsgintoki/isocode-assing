import fs from 'node:fs';
import path from 'node:path';

// This module must be imported before the API. ES module imports are evaluated
// in order, so the environment is set before the database module is loaded.
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = 'data/test-screening.db';

export const testDatabasePath = path.join(__dirname, '../data/test-screening.db');

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${testDatabasePath}${suffix}`, { force: true });
}
