import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, projectDir, readJson, writeJson } from './store.js';

/**
 * Conversaciones con el asistente, varias por proyecto.
 *
 * Se guardan en la carpeta de datos del proyecto (nunca en la del codigo del
 * usuario), en un solo archivo: son texto y pocas, no compensa una base de
 * datos. Cada una se guarda entera al terminar una respuesta.
 */

const archivo = (id) => path.join(projectDir(id), 'conversaciones.json');
const MAX_CONVERSACIONES = 200;
const MAX_MENSAJES = 400;

export async function listar(projectId) {
  const { conversaciones = [] } = await readJson(archivo(projectId), { conversaciones: [] });
  return conversaciones.sort((a, b) => b.actualizada.localeCompare(a.actualizada));
}

const limpiarMensajes = (mensajes) => (Array.isArray(mensajes) ? mensajes : [])
  .filter((m) => m && (m.who === 'user' || m.who === 'ai') && typeof m.text === 'string')
  .slice(-MAX_MENSAJES)
  .map((m) => ({ who: m.who, text: m.text.slice(0, 50000), ...(m.model ? { model: String(m.model).slice(0, 120) } : {}) }));

/** Crea o sustituye una conversacion. El titulo, si no se da, sale de la primera pregunta. */
export async function guardar(projectId, conv) {
  const lista = await listar(projectId);
  const id = conv?.id && /^conv_[a-f0-9-]{8,}$/.test(conv.id) ? conv.id : `conv_${crypto.randomUUID()}`;
  const mensajes = limpiarMensajes(conv?.mensajes);
  const primera = mensajes.find((m) => m.who === 'user')?.text ?? 'Conversacion nueva';
  const ahora = new Date().toISOString();
  const previa = lista.find((c) => c.id === id);
  const nueva = {
    id,
    titulo: String(conv?.titulo || previa?.titulo || primera).replace(/\s+/g, ' ').trim().slice(0, 80),
    creada: previa?.creada ?? ahora,
    actualizada: ahora,
    mensajes,
  };
  const resto = lista.filter((c) => c.id !== id);
  await writeJson(archivo(projectId), { conversaciones: [nueva, ...resto].slice(0, MAX_CONVERSACIONES) });
  return nueva;
}

export async function borrar(projectId, convId) {
  const lista = await listar(projectId);
  if (!lista.some((c) => c.id === convId)) throw new HttpError(404, 'Esa conversacion no existe.');
  await writeJson(archivo(projectId), { conversaciones: lista.filter((c) => c.id !== convId) });
}
