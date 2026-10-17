import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, projectDir, readJson, writeJson } from './store.js';

/**
 * Historial local de cada archivo, sin necesidad de Git.
 *
 * Justo antes de que un guardado sobrescriba un archivo, se aparta lo que
 * tenia. Asi se puede volver a cualquier version anterior aunque el proyecto
 * no tenga control de versiones. Va en la carpeta de datos del proyecto,
 * nunca en la del usuario.
 *
 * Con autoguardado se guarda cada pocos segundos: para no llenar el disco de
 * versiones casi iguales, como mucho una por minuto y archivo, 50 por archivo
 * y nada de archivos de mas de 1 MB.
 */

const MAX_VERSIONES = 50;
const MAX_BYTES = 1024 * 1024;
const CADA_MS = 60 * 1000;

const carpeta = (projectId, ruta) =>
  path.join(projectDir(projectId), 'historial-local', crypto.createHash('sha1').update(ruta).digest('hex').slice(0, 20));
const indice = (projectId, ruta) => path.join(carpeta(projectId, ruta), 'indice.json');

export async function listar(projectId, ruta) {
  const { versiones = [] } = await readJson(indice(projectId, ruta), { versiones: [] });
  return versiones;
}

/** Aparta `anterior` como version de `ruta`, si toca. Nunca hace fallar el guardado. */
export async function apartar(projectId, ruta, anterior, nuevo) {
  try {
    if (typeof anterior !== 'string' || anterior === nuevo || Buffer.byteLength(anterior) > MAX_BYTES) return;
    const versiones = await listar(projectId, ruta);
    const ultima = versiones[0];
    if (ultima && Date.now() - Date.parse(ultima.en) < CADA_MS) return;
    const id = `${Date.now()}`;
    const dir = carpeta(projectId, ruta);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.txt`), anterior, 'utf8');
    const nuevas = [{ id, en: new Date().toISOString(), bytes: Buffer.byteLength(anterior), lineas: anterior.split('\n').length }, ...versiones];
    for (const vieja of nuevas.splice(MAX_VERSIONES)) {
      await fs.rm(path.join(dir, `${vieja.id}.txt`), { force: true });
    }
    await writeJson(indice(projectId, ruta), { ruta, versiones: nuevas });
  } catch {
    /* el historial es una ayuda: si falla, el guardado sigue adelante */
  }
}

export async function leer(projectId, ruta, id) {
  if (!/^\d+$/.test(String(id ?? ''))) throw new HttpError(400, 'Version no valida.');
  const versiones = await listar(projectId, ruta);
  if (!versiones.some((v) => v.id === id)) throw new HttpError(404, 'Esa version ya no existe.');
  return fs.readFile(path.join(carpeta(projectId, ruta), `${id}.txt`), 'utf8');
}
