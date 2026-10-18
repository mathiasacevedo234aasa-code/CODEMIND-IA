import type { DetectedSymbol } from './types';

/**
 * Quién llama a quién, entre las funciones del proyecto.
 *
 * Se busca, dentro del código de cada función, un nombre de otra función
 * seguido de "(". Es por nombre, no un compilador: si dos funciones se llaman
 * igual, se prefiere la del mismo archivo; las llamadas dinámicas
 * (obj[nombre]()) no se ven. Basta para orientarse; no para garantizar nada.
 */
export interface Llamada { desde: string; hasta: string }

const ES_FUNCION = /funcion|metodo|hook|componente|constructor/;

function sinTextosNiComentarios(codigo: string) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

export function construirLlamadas(simbolos: DetectedSymbol[]) {
  const funciones = simbolos.filter((s) => s.category === 'codigo' && !s.menor && ES_FUNCION.test(s.kind));
  const porNombre = new Map<string, DetectedSymbol[]>();
  for (const f of funciones) porNombre.set(f.name, [...(porNombre.get(f.name) ?? []), f]);

  const llamadas: Llamada[] = [];
  const vistas = new Set<string>();
  for (const f of funciones) {
    // El cuerpo, sin la primera línea (la declaración se nombra a sí misma).
    const cuerpo = sinTextosNiComentarios(f.code.split('\n').slice(1).join('\n'));
    for (const m of cuerpo.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const candidatos = porNombre.get(m[1]);
      if (!candidatos) continue;
      const destino = candidatos.find((c) => c.filePath === f.filePath) ?? candidatos[0];
      if (destino.id === f.id) continue;
      const clave = `${f.id}>${destino.id}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      llamadas.push({ desde: f.id, hasta: destino.id });
    }
  }
  return { funciones, llamadas };
}
