import express from 'express';
import { db } from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

const HOLD_DURATION_SECONDS = 60;

// ============================================================
// GET /api/seats/:screeningId
// ============================================================
router.get('/:screeningId', authenticateToken, (req, res) => {
  const { screeningId } = req.params;
  const sessionId = req.headers['x-session-id'];

  try {
    // Limpiar holds expirados
    const released = db.prepare(`
      UPDATE seats
      SET    status = 'available', held_by = NULL, held_until = NULL
      WHERE  screening_id = ? AND status = 'held' AND held_until < datetime('now')
    `).run(screeningId);

    if (released.changes > 0) {
      console.log(`\x1b[33m[HOLD EXPIRED]\x1b[0m Liberados ${released.changes} asientos expirados`);
    }

    // Obtener asientos
    const seats = db.prepare(`
      SELECT
        s.id, s.row_letter, s.col_number, s.seat_type, s.status,
        s.held_by, s.held_until, s.reserved_by,
        CASE WHEN s.status = 'held' AND s.held_by = ? THEN 1 ELSE 0 END AS is_mine,
        CASE
          WHEN s.status = 'held' AND s.held_until IS NOT NULL
          THEN MAX(0, CAST((julianday(s.held_until) - julianday('now')) * 86400 AS INTEGER))
          ELSE NULL
        END AS hold_expires_in
      FROM seats s
      WHERE s.screening_id = ?
      ORDER BY s.row_letter, s.col_number
    `).all(sessionId || '', screeningId);

    // Convert is_mine from 0/1 to boolean
    seats.forEach(s => { s.is_mine = !!s.is_mine; });

    // Info de la función
    const screening = db.prepare(`
      SELECT sc.id, sc.room, sc.starts_at, m.title, m.genre, m.duration, m.rating
      FROM screenings sc
      JOIN movies m ON m.id = sc.movie_id
      WHERE sc.id = ?
    `).get(screeningId);

    const stats = {
      total: seats.length,
      available: seats.filter(s => s.status === 'available').length,
      held: seats.filter(s => s.status === 'held').length,
      reserved: seats.filter(s => s.status === 'reserved').length,
    };

    res.json({ screening, seats, stats });

  } catch (err) {
    console.error('[SEATS GET ERROR]', err.message);
    res.status(500).json({ error: 'Error al obtener asientos' });
  }
});

// ============================================================
// POST /api/seats/:screeningId/hold
// ============================================================
router.post('/:screeningId/hold', authenticateToken, (req, res) => {
  const { screeningId } = req.params;
  const { seatId } = req.body;
  const userId = req.user.userId;
  const sessionId = req.headers['x-session-id'];

  if (!seatId || !sessionId) {
    return res.status(400).json({ error: 'seatId y x-session-id son requeridos' });
  }

  console.log(`\n\x1b[35m[HOLD ATTEMPT]\x1b[0m Usuario ${req.user.username} (session: ${sessionId.slice(0,8)}...) → Asiento #${seatId}`);

  try {
    const result = db.transaction(() => {
      console.log(`\x1b[36m[TXN]\x1b[0m BEGIN - Intentando hold del asiento #${seatId}`);

      const seat = db.prepare(`
        SELECT id, row_letter, col_number, status, held_by, held_until, reserved_by
        FROM seats WHERE id = ? AND screening_id = ?
      `).get(seatId, screeningId);

      if (!seat) throw new Error('Asiento no encontrado');

      console.log(`\x1b[36m[TXN]\x1b[0m Asiento ${seat.row_letter}${seat.col_number} → estado actual: ${seat.status}`);

      if (seat.status === 'reserved') {
        db.prepare(`
          INSERT INTO reservations (seat_id, user_id, session_id, action, detail)
          VALUES (?, ?, ?, 'conflict', 'Asiento ya reservado definitivamente')
        `).run(seatId, userId, sessionId);

        throw Object.assign(
          new Error('Este asiento ya fue reservado por otro usuario'),
          { code: 'ALREADY_RESERVED', status: 409 }
        );
      }

      if (seat.status === 'held') {
        if (seat.held_by === sessionId) {
          const updated = db.prepare(`
            UPDATE seats
            SET held_until = datetime('now', '+${HOLD_DURATION_SECONDS} seconds')
            WHERE id = ?
            RETURNING id, row_letter, col_number, status, held_until
          `).get(seatId);

          console.log(`\x1b[32m[TXN]\x1b[0m Hold extendido para el mismo usuario`);
          return { action: 'extended', seat: updated };
        }

        if (seat.held_until && new Date(seat.held_until) < new Date()) {
          console.log(`\x1b[33m[TXN]\x1b[0m Hold expirado, tomando el asiento...`);
        } else {
          db.prepare(`
            INSERT INTO reservations (seat_id, user_id, session_id, action, detail)
            VALUES (?, ?, ?, 'conflict', 'Asiento en hold por otro usuario')
          `).run(seatId, userId, sessionId);

          throw Object.assign(
            new Error('Este asiento ya está siendo seleccionado por otro usuario'),
            { code: 'HELD_BY_OTHER', status: 409 }
          );
        }
      }

      const updated = db.prepare(`
        UPDATE seats
        SET status = 'held', held_by = ?, held_until = datetime('now', '+${HOLD_DURATION_SECONDS} seconds')
        WHERE id = ?
        RETURNING id, row_letter, col_number, status, held_until
      `).get(sessionId, seatId);

      db.prepare(`
        INSERT INTO reservations (seat_id, user_id, session_id, action, detail)
        VALUES (?, ?, ?, 'held', 'Hold aplicado exitosamente')
      `).run(seatId, userId, sessionId);

      console.log(`\x1b[32m[TXN]\x1b[0m COMMIT - Hold exitoso: ${updated.row_letter}${updated.col_number}`);
      return { action: 'held', seat: updated };
    })();

    res.json({
      success: true,
      ...result,
      expiresIn: HOLD_DURATION_SECONDS,
      message: result.action === 'extended'
        ? `Hold extendido por ${HOLD_DURATION_SECONDS}s más`
        : `Asiento reservado temporalmente por ${HOLD_DURATION_SECONDS}s`
    });

  } catch (err) {
    console.log(`\x1b[31m[TXN]\x1b[0m ROLLBACK - ${err.message}`);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'INTERNAL_ERROR'
    });
  }
});

// ============================================================
// POST /api/seats/:screeningId/confirm
// ============================================================
router.post('/:screeningId/confirm', authenticateToken, (req, res) => {
  const { screeningId } = req.params;
  const { seatIds } = req.body;
  const userId = req.user.userId;
  const sessionId = req.headers['x-session-id'];

  if (!seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({ error: 'seatIds array requerido' });
  }

  console.log(`\n\x1b[35m[CONFIRM ATTEMPT]\x1b[0m Usuario ${req.user.username} → Asientos: [${seatIds.join(', ')}]`);

  try {
    const result = db.transaction(() => {
      console.log(`\x1b[36m[TXN SERIALIZABLE]\x1b[0m BEGIN`);

      const placeholders = seatIds.map(() => '?').join(',');
      const seats = db.prepare(`
        SELECT id, row_letter, col_number, status, held_by, held_until
        FROM seats
        WHERE id IN (${placeholders}) AND screening_id = ?
      `).all(...seatIds, screeningId);

      if (seats.length !== seatIds.length) {
        throw new Error('Uno o más asientos no encontrados');
      }

      const conflicts = [];
      for (const seat of seats) {
        if (seat.status !== 'held' || seat.held_by !== sessionId) {
          conflicts.push(`${seat.row_letter}${seat.col_number}`);
        } else if (seat.held_until && new Date(seat.held_until) < new Date()) {
          conflicts.push(`${seat.row_letter}${seat.col_number} (expirado)`);
        }
      }

      if (conflicts.length > 0) {
        throw Object.assign(
          new Error(`Los siguientes asientos ya no están disponibles: ${conflicts.join(', ')}`),
          { code: 'SEATS_UNAVAILABLE', status: 409 }
        );
      }

      db.prepare(`
        UPDATE seats
        SET status = 'reserved', reserved_by = ?, reserved_at = datetime('now'),
            held_by = NULL, held_until = NULL
        WHERE id IN (${placeholders})
      `).run(userId, ...seatIds);

      const insertLog = db.prepare(`
        INSERT INTO reservations (seat_id, user_id, session_id, action, detail)
        VALUES (?, ?, ?, 'reserved', ?)
      `);
      for (const s of seats) {
        insertLog.run(s.id, userId, sessionId, `Reserva confirmada: ${s.row_letter}${s.col_number}`);
      }

      console.log(`\x1b[32m[TXN SERIALIZABLE]\x1b[0m COMMIT - ${seats.length} asientos reservados`);
      return { confirmed: seats.map(s => `${s.row_letter}${s.col_number}`) };
    })();

    res.json({
      success: true,
      message: `¡Reserva confirmada! Asientos: ${result.confirmed.join(', ')}`,
      seats: result.confirmed
    });

  } catch (err) {
    console.log(`\x1b[31m[TXN]\x1b[0m ROLLBACK - ${err.message}`);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'INTERNAL_ERROR'
    });
  }
});

// ============================================================
// DELETE /api/seats/:screeningId/release
// ============================================================
router.delete('/:screeningId/release', authenticateToken, (req, res) => {
  const { screeningId } = req.params;
  const { seatId } = req.body;
  const sessionId = req.headers['x-session-id'];

  try {
    const result = db.prepare(`
      UPDATE seats
      SET status = 'available', held_by = NULL, held_until = NULL
      WHERE id = ? AND screening_id = ? AND held_by = ? AND status = 'held'
    `).run(seatId, screeningId, sessionId);

    if (result.changes > 0) {
      db.prepare(`
        INSERT INTO reservations (seat_id, user_id, session_id, action, detail)
        VALUES (?, ?, ?, 'released', 'Asiento liberado por el usuario')
      `).run(seatId, req.user.userId, sessionId);
    }

    res.json({ success: true, released: result.changes > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/seats/:screeningId/logs
// ============================================================
router.get('/:screeningId/logs', authenticateToken, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT
        r.id, r.action, r.detail, r.session_id, r.created_at,
        u.username,
        s.row_letter || CAST(s.col_number AS TEXT) AS seat_label
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN seats s ON s.id = r.seat_id
      WHERE s.screening_id = ?
      ORDER BY r.created_at DESC
      LIMIT 50
    `).all(req.params.screeningId);

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
