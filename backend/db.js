import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let electronApp = null;
try {
  if (process.env.ELECTRON === 'true') {
    const electron = await import('electron');
    electronApp = electron.app;
  }
} catch (e) {
  // Not running inside Electron
}

function getDbPath() {
  if (process.env.ELECTRON === 'true' && electronApp) {
    const userDataPath = electronApp.getPath('userData');
    const dbDir = path.join(userDataPath, 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'cines_unidos.db');
    if (!fs.existsSync(dbPath)) {
      const bundledDb = path.join(process.resourcesPath, 'backend', 'cines_unidos.db');
      if (fs.existsSync(bundledDb)) {
        fs.copyFileSync(bundledDb, dbPath);
      }
    }
    return dbPath;
  }
  return path.join(__dirname, 'cines_unidos.db');
}

const DB_PATH = getDbPath();

// Create database connection
const dbPromise = open({
  filename: DB_PATH,
  driver: sqlite3.Database
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
    const stmt = await database.prepare(sql);
    return {
      run: async (...params) => stmt.run(...params),
      get: async (...params) => stmt.get(...params),
      all: async (...params) => stmt.all(...params)
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
