import type { FunctionDoc } from './types';

/**
 * Avisos de calidad de una documentación, sin IA: textos demasiado cortos,
 * frases vacías ("realiza varias operaciones"), parámetros sin explicar...
 * Son avisos, no bloqueos: se puede aprobar igual.
 */
const VAGAS = [
  /\bhace (varias|algunas|muchas) cosas\b/i,
  /\brealiza (varias|algunas|diversas) (operaciones|acciones|tareas)\b/i,
  /\bse encarga de (todo|varias cosas)\b/i,
  /\bmaneja (la|el|los|las) l[oó]gica\b/i,
  /\betc\.?$/i,
  /\bentre otras cosas\b/i,
  /\bdoes (various|several|some) (things|operations|tasks)\b/i,
  /\bhandles (the )?logic\b/i,
];

const MINIMOS: [keyof FunctionDoc, number, string][] = [
  ['proposito', 25, 'propósito'],
  ['explicacion', 60, 'explicación'],
];

export interface AvisoDoc { campo: string; mensaje: string }

export function avisosDoc(doc: FunctionDoc | null | undefined): AvisoDoc[] {
  if (!doc) return [];
  const avisos: AvisoDoc[] = [];
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  for (const [campo, minimo, nombre] of MINIMOS) {
    const t = texto(doc[campo]);
    if (!t) avisos.push({ campo: nombre, mensaje: 'Está vacío.' });
    else if (t.length < minimo) avisos.push({ campo: nombre, mensaje: `Muy corto (${t.length} caracteres): probablemente no explica lo suficiente.` });
  }

  for (const [campo, valor] of Object.entries(doc)) {
    const t = texto(valor);
    if (t && VAGAS.some((r) => r.test(t))) avisos.push({ campo, mensaje: `Frase vaga: "${t.slice(0, 60)}${t.length > 60 ? '…' : ''}"` });
  }

  for (const p of doc.parametros ?? []) {
    if (!texto(p.descripcion) || texto(p.descripcion).length < 8) {
      avisos.push({ campo: 'parámetros', mensaje: `"${p.nombre}" no tiene una descripción útil.` });
    }
  }
  return avisos;
}
