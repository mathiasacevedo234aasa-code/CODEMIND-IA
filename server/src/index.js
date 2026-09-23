import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { PORT, ROOT, DEFAULT_MODEL } from './env.js';
import { ensureDataDirs, getApiKey } from './services/store.js';
import { gitAvailable } from './services/git.js';
import { getToken as getGithubToken } from './services/github.js';
import { stopAll } from './services/runner.js';
import projectsRouter from './routes/projects.js';
import docsRouter from './routes/docs.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';
import workspaceRouter from './routes/workspace.js';

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

// Servir el build de produccion si existe (npm run build).
const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Manejador de errores: mensajes claros, nunca secretos.
app.use((err, _req, res, _next) => {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error('[codemind]', err.message);
  res.status(status).json({ error: err.message || 'Error interno del servidor.' });
});

await ensureDataDirs();
const { key, source } = await getApiKey();
const git = await gitAvailable();

// Solo 127.0.0.1: este backend puede navegar por el disco y ejecutar los
// scripts del proyecto, asi que no debe quedar accesible desde la red.
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`CodeMind AI backend en http://localhost:${PORT}`);
  console.log(`Modelo Groq por defecto: ${DEFAULT_MODEL}`);
  console.log(
    key
      ? `API key de Groq: configurada (origen: ${source}).`
      : 'API key de Groq: NO configurada. Anade GROQ_API_KEY al .env o guardala desde Configuracion.',
  );
  console.log(git.available ? `Git disponible: ${git.version}` : 'Git: no disponible en este equipo.');
});

/** Al cerrar, los servidores de desarrollo arrancados no deben quedar huerfanos. */
function shutdown() {
  console.log('\nCerrando CodeMind AI: deteniendo los procesos en ejecucion...');
  stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
