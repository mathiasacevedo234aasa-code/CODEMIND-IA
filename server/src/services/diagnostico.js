import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSettings, getApiKey } from './store.js';
import { descriptor } from './proveedores.js';
import { gitAvailable } from './git.js';
import { disponibilidad } from './terminal.js';

/**
 * Datos para reportar un fallo sin pedir capturas: version, sistema, entorno
 * y ajustes. NUNCA claves: de los ajustes se quitan los campos sensibles y,
 * por si acaso, todo el texto pasa por limpiarClaves() antes de salir.
 */

/** Tapa todo lo que tenga pinta de clave o token, venga de donde venga. */
export function limpiarClaves(texto) {
  return String(texto)
    .replace(/\b(gsk|sk|sk-ant|sk-or|ghp|gho|ghs|github_pat|xox[abp])[-_][A-Za-z0-9_-]{8,}/g, '[clave oculta]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (/\d/.test(m) && /[a-z]/i.test(m) ? '[posible clave oculta]' : m));
}

export async function diagnostico() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const version = JSON.parse(await fs.readFile(path.join(raiz, 'package.json'), 'utf8').catch(() => '{}')).version ?? '?';
  const settings = await readSettings();
  const proveedor = descriptor(settings.proveedor || 'groq');
  const { source } = proveedor.necesitaClave ? await getApiKey(proveedor.id) : { source: 'no hace falta' };
  const git = await gitAvailable().catch(() => null);
  const terminal = await disponibilidad().catch((e) => ({ error: e.message }));
  // Ajustes sin nada que pueda ser privado (claves, precios propios...).
  const { precios, snippets, ...ajustes } = settings;
  return {
    aplicacion: { version, electron: process.versions.electron ?? null, node: process.versions.node },
    sistema: { plataforma: process.platform, version: os.release(), arquitectura: process.arch, memoriaGB: Math.round(os.totalmem() / 2 ** 30) },
    ia: { proveedor: proveedor.nombre, modelo: settings.modelos?.[proveedor.id] || proveedor.modeloPorDefecto, origenDeLaClave: source ?? 'ninguna' },
    git,
    terminal,
    ajustes: { ...ajustes, editor: { ...ajustes.editor, temaVsCode: ajustes.editor?.temaVsCode ? '(importado)' : null }, snippets: snippets?.length ?? 0, precios: precios ? Object.keys(precios).length : 0 },
  };
}
