import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
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
