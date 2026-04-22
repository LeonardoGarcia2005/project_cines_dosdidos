import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { router as authRouter } from './routes/auth.js';
import seatsRouter from './routes/seats.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id']
}));
app.use(express.json());

// Servir frontend estático
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ============================================================
// Routes API
// ============================================================
app.use('/api/auth', authRouter);
app.use('/api/seats', seatsRouter);

// ============================================================
// POST /api/backup - Crear backup de la base de datos
// ============================================================
app.post('/api/backup', async (req, res) => {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `cines_unidos_${timestamp}.db`);
  const dbFile = path.join(__dirname, 'cines_unidos.db');

  if (!fs.existsSync(dbFile)) {
    return res.status(404).json({ error: 'Base de datos no encontrada' });
  }

  try {
    // Forzar WAL checkpoint para que todos los datos pendientes
    // (incluyendo reservaciones) se escriban en el .db principal
    const database = await (await import('./db.js')).dbPromise;
    await database.run('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log('\x1b[36m[BACKUP]\x1b[0m WAL checkpoint completado');

    const stats = fs.statSync(dbFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Simular un pequeño delay para que se note visualmente el proceso
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Copiar el archivo principal de la base de datos
    fs.copyFileSync(dbFile, backupFile);

    // Copiar también los archivos WAL y SHM si existen
    const walFile = dbFile + '-wal';
    const shmFile = dbFile + '-shm';
    if (fs.existsSync(walFile)) fs.copyFileSync(walFile, backupFile + '-wal');
    if (fs.existsSync(shmFile)) fs.copyFileSync(shmFile, backupFile + '-shm');

    const backupStats = fs.statSync(backupFile);
    const backupSizeMB = (backupStats.size / (1024 * 1024)).toFixed(2);

    // Listar backups existentes
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const s = fs.statSync(path.join(backupDir, f));
        return { filename: f, size: (s.size / 1024).toFixed(1) + ' KB', date: s.mtime };
      })
      .sort((a, b) => b.date - a.date);

    console.log(`\x1b[32m[BACKUP]\x1b[0m Backup creado: ${backupFile} (${backupSizeMB} MB)`);

    res.json({
      success: true,
      message: `Backup creado exitosamente`,
      backup: {
        filename: `cines_unidos_${timestamp}.db`,
        originalSize: fileSizeMB + ' MB',
        backupSize: backupSizeMB + ' MB',
        timestamp: new Date().toISOString()
      },
      totalBackups: backups.length,
      backups
    });
  } catch (err) {
    console.error('[BACKUP ERROR]', err.message);
    res.status(500).json({ error: 'Error al crear el backup', detail: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback: servir index.html para rutas del frontend
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ============================================================
// Error handler global
// ============================================================
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================================
// Iniciar servidor
// ============================================================
app.listen(PORT, () => {
  console.log('\n\x1b[35m╔══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║     CINES UNIDOS - Backend Server    ║\x1b[0m');
  console.log('\x1b[35m╚══════════════════════════════════════╝\x1b[0m');
  console.log(`\x1b[32m✓\x1b[0m Servidor corriendo en http://localhost:${PORT}`);
  console.log(`\x1b[32m✓\x1b[0m API disponible en http://localhost:${PORT}/api`);
  console.log('\x1b[33m⚡\x1b[0m Modo: Demostración de transacciones concurrentes\n');
});
