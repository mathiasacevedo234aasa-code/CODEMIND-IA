import path from 'node:path';
import { projectDir, readJson, writeJson } from './store.js';

/**
 * 👍 / 👎 sobre la documentación generada, por proyecto.
 *
 * Sirven para que las siguientes salgan mejor: lo que el usuario dijo que
 * falló ("demasiado larga", "no explica el retorno") se le pasa a la IA como
 * preferencia al documentar. Solo texto que escribió el usuario; nada se
 * deduce a escondidas.
 */
const archivo = (id) => path.join(projectDir(id), 'valoraciones.json');

export async function listar(projectId) {
  const { valoraciones = [] } = await readJson(archivo(projectId), { valoraciones: [] });
  return valoraciones;
}

export async function anadir(projectId, { functionId, voto, nota }) {
  const v = voto === 'bien' ? 'bien' : 'mal';
  const lista = await listar(projectId);
  lista.unshift({ functionId: String(functionId ?? ''), voto: v, nota: String(nota ?? '').trim().slice(0, 300), en: new Date().toISOString() });
  await writeJson(archivo(projectId), { valoraciones: lista.slice(0, 200) });
  return lista;
}

/** Lo que se le dice a la IA: las quejas recientes y si en general gusta. */
export async function comoPreferencias(projectId) {
  const lista = await listar(projectId);
  if (!lista.length) return '';
  const quejas = lista.filter((v) => v.voto === 'mal' && v.nota).slice(0, 8).map((v) => `- ${v.nota}`);
  const bien = lista.filter((v) => v.voto === 'bien').length;
  const mal = lista.filter((v) => v.voto === 'mal').length;
  return [
    `Valoraciones del usuario sobre documentacion anterior de este proyecto: ${bien} positivas, ${mal} negativas.`,
    quejas.length ? `Lo que el usuario pidio evitar o mejorar:\n${quejas.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}
