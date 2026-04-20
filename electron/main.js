import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

const PORT = 3000;

async function startServer() {
  const rootDir = path.join(__dirname, '..');
  process.env.PORT = String(PORT);
  process.env.ELECTRON = 'true';

  // Run seed first (dynamic import runs the module)
  try {
    const seedPath = path.join(rootDir, 'backend', 'seed.js');
    await import(seedPath);
    console.log('[Seed] Completed successfully');
  } catch (err) {
    console.error('[Seed] Failed:', err);
  }

  // Start server (dynamic import starts Express)
  try {
    const serverPath = path.join(rootDir, 'backend', 'server.js');
    await import(serverPath);
    console.log('[Server] Started successfully');
  } catch (err) {
    console.error('[Server] Failed:', err);
  }

  // Give Express a moment to bind the port
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function createWindow() {
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Cines Unidos',
    icon: path.join(__dirname, '..', 'frontend', 'public', 'img', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
