import type { MapaProyecto } from './projectMap';

/**
 * Diagrama Mermaid a partir del mapa de dependencias.
 *
 * Sale del mismo grafo que dibuja el mapa, que a su vez sale de los import
 * reales del código: no lo inventa ninguna IA. Cada carpeta es un subgrafo y
 * cada flecha es "este archivo importa aquel". Las dependencias externas
 * (paquetes de npm, etc.) se dejan fuera para que no tapen la estructura.
 */
export function mermaidDesdeMapa(mapa: MapaProyecto, opciones: { direccion?: 'LR' | 'TD' } = {}): string {
  const internos = mapa.nodos.filter((n) => !n.externo);
  const ids = new Map(internos.map((n, i) => [n.path, `f${i}`]));
  // Mermaid no acepta cualquier cosa entre corchetes: comillas y corchetes fuera.
  const etiqueta = (t: string) => `"${t.replace(/["[\]]/g, '')}"`;

  const lineas = [`flowchart ${opciones.direccion ?? 'LR'}`];
  const porCarpeta = new Map<string, typeof internos>();
  for (const n of internos) {
    const lista = porCarpeta.get(n.carpeta) ?? [];
    lista.push(n);
    porCarpeta.set(n.carpeta, lista);
  }

  let sub = 0;
  for (const [carpeta, nodos] of [...porCarpeta].sort(([a], [b]) => a.localeCompare(b))) {
    const dentro = nodos.map((n) => `    ${ids.get(n.path)}[${etiqueta(n.path.split('/').pop() ?? n.path)}]`);
    if (carpeta) {
      lineas.push(`  subgraph s${sub++}[${etiqueta(carpeta.startsWith('(') ? carpeta : `${carpeta}/`)}]`, ...dentro, '  end');
    } else {
      lineas.push(...dentro.map((l) => l.slice(2)));
    }
  }

  const vistas = new Set<string>();
  for (const a of mapa.aristas) {
    const desde = ids.get(a.desde);
    const hasta = ids.get(a.hasta);
    if (!desde || !hasta || desde === hasta) continue;
    const clave = `${desde}>${hasta}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    lineas.push(`  ${desde} --> ${hasta}`);
  }

  // Los archivos implicados en un ciclo, marcados: es lo primero que se mira.
  const enCiclo = new Set(mapa.ciclos.flat());
  const marcados = [...enCiclo].map((p) => ids.get(p)).filter(Boolean);
  if (marcados.length) {
    lineas.push('  classDef ciclo stroke:#e06c75,stroke-width:2px', `  class ${marcados.join(',')} ciclo`);
  }
  return lineas.join('\n');
}

let temaIniciado: boolean | null = null;

/** Dibuja un diagrama Mermaid en SVG. Mermaid pesa mucho: se carga la primera vez. */
export async function dibujarMermaid(codigo: string, oscuro: boolean): Promise<string> {
  const { default: mermaid } = await import('mermaid');
  if (temaIniciado !== oscuro) {
    // securityLevel strict: sin HTML ni enlaces dentro de las etiquetas.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: oscuro ? 'dark' : 'default' });
    temaIniciado = oscuro;
  }
  const { svg } = await mermaid.render(`diagrama-${Date.now()}`, codigo);
  return svg;
}
