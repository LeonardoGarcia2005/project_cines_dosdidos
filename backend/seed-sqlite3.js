import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'cines_unidos.db');

async function seed() {
  console.log('[SEED] Iniciando seed de base de datos...');

  // Delete existing database for clean restore
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('[SEED] Base de datos anterior eliminada');
  }

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schemaSql);
  console.log('[SEED] Schema ejecutado exitosamente');

  const hash = bcrypt.hashSync('123456', 10);

  // Insert users
  await db.run(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    ['usuario1', 'user1@cinesunidos.com', hash]
  );
  await db.run(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    ['usuario2', 'user2@cinesunidos.com', hash]
  );
  await db.run(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    ['admin', 'admin@cinesunidos.com', hash]
  );
  console.log('[SEED] 3 usuarios creados (contraseña: 123456)');

  // Insert movie
  await db.run(
    "INSERT INTO movies (title, genre, duration, rating) VALUES (?, ?, ?, ?)",
    ['Avengers: Doomsday', 'Acción / Sci-Fi', 150, 'PG-13']
  );
  console.log('[SEED] Película creada');

  // Insert screening
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await db.run(
    "INSERT INTO screenings (movie_id, room, starts_at, total_seats) VALUES (?, ?, ?, ?)",
    [1, 'Sala 5 - IMAX', startsAt, 300]
  );
  console.log('[SEED] Función creada');

  // Insert seats
  const rows = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
  let seatCount = 0;

  for (const r of rows) {
    for (let c = 1; c <= 28; c++) {
      if (c === 8) continue;

      let stype = 'standard';
      if (r === 'M' && [9, 10, 11, 12].includes(c)) {
        stype = 'handicap';
      }
      await db.run(
        'INSERT INTO seats (screening_id, row_letter, col_number, seat_type, status) VALUES (?, ?, ?, ?, ?)',
        [1, r, c, stype, 'available']
      );
      seatCount++;
    }
  }
  console.log(`[SEED] ${seatCount} asientos creados`);

  await db.close();
  console.log('[SEED] Seed completado exitosamente');
}

seed().catch(err => {
  console.error('[SEED ERROR]', err);
  process.exit(1);
});
