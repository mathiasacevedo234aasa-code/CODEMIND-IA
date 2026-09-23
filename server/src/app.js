import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { DEFAULT_MODEL, WEB_DIST } from './env.js';
import { ensureDataDirs, getApiKey } from './services/store.js';
import { gitAvailable } from './services/git.js';
import { getToken as getGithubToken } from './services/github.js';
import { stopAll } from './services/runner.js';
import projectsRouter from './routes/projects.js';
import docsRouter from './routes/docs.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';
import workspaceRouter from './routes/workspace.js';

/**
 * Construye la aplicacion Express. Esta separada del arranque para que la
 * puedan usar tanto el servidor de linea de comandos como la aplicacion de
 * escritorio, sin duplicar el montaje de rutas.
 */
export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', async (_req, res) => {
    const { key, source } = await getApiKey();
    const git = await gitAvailable();
    res.json({
      ok: true,
      defaultModel: DEFAULT_MODEL,
      groq: { configured: Boolean(key), source },
      git,
      github: { configured: Boolean(await getGithubToken()) },
    });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', docsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api', workspaceRouter);

  // Sirve el frontend compilado cuando existe. En la aplicacion de escritorio
  // esto es lo que carga la ventana, asi que las rutas relativas /api siguen
  // funcionando igual que en el navegador.
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  // Manejador de errores: mensajes claros, nunca secretos.
  app.use((err, _req, res, _next) => {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error('[codemind]', err.message);
    res.status(status).json({ error: err.message || 'Error interno del servidor.' });
  });

  return app;
}

/**
 * Arranca el backend en localhost. Con port 0 el sistema elige un puerto libre,
 * que es lo que usa la aplicacion de escritorio para no chocar con nada.
 *
 * Solo 127.0.0.1: este backend puede navegar por el disco y ejecutar los
 * scripts del proyecto, asi que no debe quedar accesible desde la red.
 */
export async function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  await ensureDataDirs();
  const app = createApp();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on('error', reject);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    /**
     * Cierra el servidor y detiene los procesos que se hubieran arrancado.
     *
     * server.close() solo resuelve cuando se cierran TODAS las conexiones, y la
     * ventana mantiene conexiones keep-alive abiertas: sin cerrarlas a mano, la
     * aplicacion de escritorio se quedaba viva para siempre al cerrar la
     * ventana. El plazo maximo es la ultima red de seguridad.
     */
    async close({ timeoutMs = 3000 } = {}) {
      stopAll();
      server.closeAllConnections?.();
      await Promise.race([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    },
  };
}
