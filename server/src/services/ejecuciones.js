import path from 'node:path';
import { HttpError, projectDir, readJson, writeJson } from './store.js';

/**
 * Historial de ejecuciones del panel Ejecutar: qué se lanzó, cuánto tardó,
 * con qué código terminó y qué sacó por pantalla. Sirve para comparar una
 * corrida con otra ("ayer pasaba, hoy no: ¿qué cambió en la salida?").
 *
 * Se guardan las 50 últimas, con la salida recortada a 200 KB cada una.
 */

const MAX = 50;
const MAX_SALIDA = 200 * 1024;
const archivo = (id) => path.join(projectDir(id), 'ejecuciones.json');

export async function listar(projectId) {
  const { ejecuciones = [] } = await readJson(archivo(projectId), { ejecuciones: [] });
  // La lista va sin la salida, que pesa: se pide aparte.
  return ejecuciones.map(({ salida, ...resto }) => ({ ...resto, lineas: salida.split('\n').length }));
}

export async function leer(projectId, id) {
  const { ejecuciones = [] } = await readJson(archivo(projectId), { ejecuciones: [] });
  const e = ejecuciones.find((x) => x.id === id);
  if (!e) throw new HttpError(404, 'Esa ejecucion ya no esta en el historial.');
  return e;
}

/** Se llama al terminar un proceso. Nunca hace fallar nada. */
export async function registrar(projectId, proc) {
  try {
    const { ejecuciones = [] } = await readJson(archivo(projectId), { ejecuciones: [] });
    let salida = proc.lines.map((l) => (l.stream === 'stderr' ? `[err] ${l.text}` : l.text)).join('\n');
    if (salida.length > MAX_SALIDA) salida = `[...recortado...]\n${salida.slice(-MAX_SALIDA)}`;
    const registro = {
      id: proc.id,
      etiqueta: proc.label,
      comando: proc.command,
      inicio: proc.startedAt,
      fin: proc.endedAt,
      ms: Date.parse(proc.endedAt) - Date.parse(proc.startedAt),
      codigo: proc.exitCode,
      salida,
    };
    await writeJson(archivo(projectId), { ejecuciones: [registro, ...ejecuciones.filter((e) => e.id !== proc.id)].slice(0, MAX) });
  } catch {
    /* el historial es una ayuda */
  }
}
