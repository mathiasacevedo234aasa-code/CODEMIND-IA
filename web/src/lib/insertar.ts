import { editorActivo } from './editorActivo';
import { api } from './api';

/** Inserta texto donde está el cursor del editor activo (o sustituye la selección). */
export function insertarEnCursor(texto: string) {
  const ed = editorActivo();
  const sel = ed?.getSelection();
  if (!ed || !sel) return false;
  ed.executeEdits('codemind', [{ range: sel, text: texto }]);
  ed.focus();
  return true;
}

const dos = (n: number) => String(n).padStart(2, '0');
export const fechaHoy = () => { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
export const fechaHora = () => { const d = new Date(); return `${fechaHoy()} ${dos(d.getHours())}:${dos(d.getMinutes())}`; };

/** El comentario de línea del lenguaje del archivo abierto. */
function comentario(): [string, string] {
  const lenguaje = editorActivo()?.getModel()?.getLanguageId() ?? 'javascript';
  if (['python', 'shell', 'ruby', 'yaml', 'r', 'perl', 'powershell', 'dockerfile', 'elixir', 'julia', 'toml'].includes(lenguaje)) return ['# ', ''];
  if (['html', 'xml', 'markdown', 'vue', 'svelte'].includes(lenguaje)) return ['<!-- ', ' -->'];
  if (['css', 'scss', 'less'].includes(lenguaje)) return ['/* ', ' */'];
  if (['sql', 'lua', 'haskell'].includes(lenguaje)) return ['-- ', ''];
  return ['// ', ''];
}

/**
 * Cabecera de licencia (identificador SPDX, el estándar que entienden las
 * herramientas), con el nombre de git del usuario si lo tiene configurado.
 */
export async function insertarLicencia(spdx: 'MIT' | 'Apache-2.0' | 'GPL-3.0-or-later' | 'BSD-3-Clause') {
  const { nombre } = await api.usuarioGit().catch(() => ({ nombre: null }));
  const [a, b] = comentario();
  const lineas = [`SPDX-License-Identifier: ${spdx}`, `Copyright (c) ${new Date().getFullYear()} ${nombre ?? '<tu nombre>'}`];
  insertarEnCursor(`${lineas.map((l) => `${a}${l}${b}`).join('\n')}\n`);
}
