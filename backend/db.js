import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDbPath() {
  return path.join(__dirname, 'cines_unidos.db');
}

const DB_PATH = getDbPath();

// Create database connection
const dbPromise = open({
  filename: DB_PATH,
  driver: sqlite3.Database
}).then(async (database) => {
  await database.configure('busyTimeout', 5000);
  return database;
});

// Initialize schema
async function initSchema() {
  const db = await dbPromise;
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await db.exec(sql);
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA foreign_keys = ON');
    console.log('[DB] Schema inicializado');
  } catch (err) {
    if (!err.message.includes('already exists')) {
      console.error('[SCHEMA ERROR]', err.message);
    }
  }
}

await initSchema();

// Wrapper to maintain compatibility with better-sqlite3 API
const db = {
  async prepare(sql) {
    const database = await dbPromise;
    return {
      run: async (...params) => database.run(sql, ...params),
      get: async (...params) => database.get(sql, ...params),
      all: async (...params) => database.all(sql, ...params)
    };
  },
  async exec(sql) {
    const database = await dbPromise;
    return database.exec(sql);
  },
  transaction(fn) {
    return async (...args) => {
      const database = await dbPromise;
      await database.run('BEGIN TRANSACTION');
      try {
        const result = await fn(...args);
        await database.run('COMMIT');
        return result;
      } catch (err) {
        await database.run('ROLLBACK');
        throw err;
      }
    };
  },
  _db: dbPromise
};

export { db, dbPromise };
