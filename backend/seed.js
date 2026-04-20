import bcrypt from 'bcryptjs';
import { db } from './db.js';

function seed() {
  console.log('\x1b[35m[SEED]\x1b[0m Iniciando seed de base de datos...');

  const hash = bcrypt.hashSync('123456', 10);

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    insertUser.run('usuario1', 'user1@cinesunidos.com', hash);
    insertUser.run('usuario2', 'user2@cinesunidos.com', hash);
    insertUser.run('admin', 'admin@cinesunidos.com', hash);
    console.log('\x1b[32m[SEED]\x1b[0m Usuarios creados (contraseña: 123456)');
  } else {
    db.prepare("UPDATE users SET password = ? WHERE username IN ('usuario1', 'usuario2', 'admin')").run(hash);
    console.log('\x1b[32m[SEED]\x1b[0m Passwords actualizados (contraseña: 123456)');
  }

  const movieCount = db.prepare('SELECT COUNT(*) as cnt FROM movies').get().cnt;
  if (movieCount === 0) {
    db.prepare("INSERT INTO movies (title, genre, duration, rating) VALUES (?, ?, ?, ?)")
      .run('Avengers: Doomsday', 'Acción / Sci-Fi', 150, 'PG-13');
    console.log('\x1b[32m[SEED]\x1b[0m Película creada');
  }

  const screeningCount = db.prepare('SELECT COUNT(*) as cnt FROM screenings').get().cnt;
  if (screeningCount === 0) {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO screenings (movie_id, room, starts_at, total_seats) VALUES (?, ?, ?, ?)")
      .run(1, 'Sala 5 - IMAX', startsAt, 300);
    console.log('\x1b[32m[SEED]\x1b[0m Función creada');
  }

  // Clear existing seats and recreate with correct layout
  db.prepare('DELETE FROM reservations').run();
  db.prepare('DELETE FROM seats').run();
  db.prepare('VACUUM').run();

  const rows = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
  const insertSeat = db.prepare(
    'INSERT INTO seats (screening_id, row_letter, col_number, seat_type, status) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      for (let c = 1; c <= 28; c++) {
        // Skip column 8 - it's the aisle position in the UI
        if (c === 8) continue;

        let stype = 'standard';
        // Handicap seats moved to columns 9-12 (after the aisle)
        if (r === 'M' && [9, 10, 11, 12].includes(c)) {
          stype = 'handicap';
        }
        insertSeat.run(1, r, c, stype, 'available');
      }
    }
  });

  insertMany(rows);
  console.log(`\x1b[32m[SEED]\x1b[0m Asientos creados: ${rows.length * 27}`); // 27 = 28 - 1 (aisle)

  console.log('\x1b[32m[SEED]\x1b[0m Seed completado exitosamente ✓');
}

seed();
