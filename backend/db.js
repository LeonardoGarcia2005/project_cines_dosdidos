import Database from 'better-sqlite3';
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

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    db.exec(sql);
  } catch (err) {
    if (!err.message.includes('already exists')) {
      console.error('[SCHEMA ERROR]', err.message);
    }
  }
}

initSchema();

export { db };
