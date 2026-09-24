import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..', '..');
export const SERVER_ROOT = path.resolve(here, '..');

/**
 * Donde se guardan proyectos, documentacion, memoria y secretos.
 *
 * En la aplicacion de escritorio el codigo vive dentro del paquete instalado,
 * que es de solo lectura, asi que Electron pasa aqui la carpeta de datos del
 * usuario. Sin esta variable se usa server/data, como en desarrollo.
 */
export const DATA_DIR = process.env.CODEMIND_DATA_DIR
  ? path.resolve(process.env.CODEMIND_DATA_DIR)
  : path.join(SERVER_ROOT, 'data');

export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

/** Carpeta del build del frontend. La aplicacion de escritorio la reubica. */
export const WEB_DIST = process.env.CODEMIND_WEB_DIST
  ? path.resolve(process.env.CODEMIND_WEB_DIST)
  : path.join(ROOT, 'web', 'dist');

/**
 * El .env de la raiz nunca se sirve al frontend.
 *
 * Se lee con `processEnv: {}` para no contaminar process.env y, sobre todo,
 * para poder darle prioridad sobre una variable del sistema con el mismo
 * nombre: si la maquina ya tiene un GROQ_API_KEY antiguo exportado, el valor
 * del proyecto debe ganar. Si no, el usuario editaria el .env sin efecto y
 * veria errores 401 sin explicacion.
 *
 * En la aplicacion instalada no existe ningun .env: ahi la clave se guarda
 * desde Configuracion, en DATA_DIR/secrets.json.
 */
const fileEnv = dotenv.config({ path: path.join(ROOT, '.env'), processEnv: {} }).parsed ?? {};

/** Solo el valor del archivo .env, sin mirar el entorno del sistema. */
export const fileEnvValue = (name) => fileEnv[name] || null;

/** Orden de prioridad: .env del proyecto, luego variable del sistema. */
export const fromEnv = (name) => fileEnv[name] || process.env[name] || null;

export const PORT = Number(fromEnv('PORT') || 5174);

// Los identificadores de modelo de Groq cambian con el tiempo y dependen de la
// cuenta. No se fija ninguno en el codigo: este es solo el valor de arranque.
export const DEFAULT_MODEL = fromEnv('GROQ_MODEL') || 'openai/gpt-oss-120b';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
