import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../env.js';
import { readJson, writeJson } from './store.js';

/**
 * Cache de documentacion generada, por huella.
 *
 * Si se vuelve a pedir la documentacion de un codigo IDENTICO con las MISMAS
 * opciones (nivel, estilo, idioma, glosario, modelo, indicacion extra...), se
 * devuelve la respuesta anterior sin llamar a la IA: es la misma pregunta y
 * cuesta tiempo y dinero. En cuanto cambia cualquier cosa, la huella cambia y
 * se pregunta de nuevo. "Forzar" se la salta.
 *
 * Solo guarda lo que la IA propuso, que de todas formas pasa por Revision.
 */

const archivo = path.join(DATA_DIR, 'cache-docs.json');
const MAX_ENTRADAS = 500;

export function huella(partes) {
  return crypto.createHash('sha256').update(JSON.stringify(partes)).digest('hex');
}

export async function leer(clave) {
  const { entradas = {} } = await readJson(archivo, { entradas: {} });
  return entradas[clave]?.resultado ?? null;
}

export async function guardar(clave, resultado) {
  const { entradas = {} } = await readJson(archivo, { entradas: {} });
  entradas[clave] = { resultado, en: new Date().toISOString() };
  // Se quedan las mas recientes: un archivo de cache no debe crecer sin fin.
  const ordenadas = Object.entries(entradas).sort(([, a], [, b]) => b.en.localeCompare(a.en)).slice(0, MAX_ENTRADAS);
  await writeJson(archivo, { entradas: Object.fromEntries(ordenadas) });
}
