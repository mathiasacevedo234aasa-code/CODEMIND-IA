import { PORT, DEFAULT_MODEL } from './env.js';
import { getApiKey } from './services/store.js';
import { gitAvailable } from './services/git.js';
import { startServer } from './app.js';

/** Arranque por linea de comandos (npm run dev / npm start). */

const { url, close } = await startServer({ port: PORT });
const { key, source } = await getApiKey();
const git = await gitAvailable();

console.log(`CodeMind AI backend en ${url}`);
console.log(`Modelo Groq por defecto: ${DEFAULT_MODEL}`);
console.log(
  key
    ? `API key de Groq: configurada (origen: ${source}).`
    : 'API key de Groq: NO configurada. Anade GROQ_API_KEY al .env o guardala desde Configuracion.',
);
console.log(git.available ? `Git disponible: ${git.version}` : 'Git: no disponible en este equipo.');

/** Al cerrar, los servidores de desarrollo arrancados no deben quedar huerfanos. */
async function shutdown() {
  console.log('\nCerrando CodeMind AI: deteniendo los procesos en ejecucion...');
  await close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
