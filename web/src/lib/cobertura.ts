import type { ApprovedDoc, DetectedSymbol, DocStatus } from './types';

/**
 * Cuánto de un proyecto está documentado.
 *
 * Solo cuenta lo que tiene sentido documentar. Un párrafo suelto o un `<div>`
 * sin id ni clase (lo que el analizador marca como relleno) no entra: si
 * contara, una página HTML normal tendría siempre un porcentaje ridículo y el
 * número dejaría de decir nada.
 */

export interface Cobertura {
  /** Elementos que cuentan para el porcentaje. */
  total: number;
  /** Con documentación aprobada y al día. */
  alDia: number;
  /** Con documentación aprobada, pero el código cambió después. */
  revisar: number;
  /** Porcentaje documentado, contando también lo que hay que revisar. */
  porcentaje: number;
}

const VACIA: Cobertura = { total: 0, alDia: 0, revisar: 0, porcentaje: 0 };

const cuenta = (s: DetectedSymbol) => !s.menor;

export function coberturaDe(
  symbols: DetectedSymbol[],
  approved: Record<string, ApprovedDoc>,
  statusOf: (s: DetectedSymbol) => DocStatus,
): { proyecto: Cobertura; porArchivo: Record<string, Cobertura> } {
  const porArchivo: Record<string, Cobertura> = {};
  const proyecto = { ...VACIA };

  for (const s of symbols) {
    if (!cuenta(s)) continue;
    const archivo = (porArchivo[s.filePath] ??= { ...VACIA });
    archivo.total++;
    proyecto.total++;
    if (!approved[s.id]) continue;
    if (statusOf(s) === 'revisar') {
      archivo.revisar++;
      proyecto.revisar++;
    } else {
      archivo.alDia++;
      proyecto.alDia++;
    }
  }

  const pct = (c: Cobertura) => (c.total ? Math.round(((c.alDia + c.revisar) / c.total) * 100) : 0);
  for (const c of Object.values(porArchivo)) c.porcentaje = pct(c);
  proyecto.porcentaje = pct(proyecto);

  return { proyecto, porArchivo };
}

/** Color de la barra según cuánto hay documentado. */
export function tonoDe(c: Cobertura): 'ok' | 'warn' | 'muted' {
  if (c.revisar > 0) return 'warn';
  if (c.porcentaje >= 60) return 'ok';
  return 'muted';
}
