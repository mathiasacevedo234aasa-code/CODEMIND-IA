import { analizarArchivo, type FileAnalysis } from './index.ts';

/**
 * Analiza en el trabajador de fondo y, si el navegador no lo permite o el
 * trabajador falla al arrancar, aquí mismo. El resultado es el mismo; solo
 * cambia si la ventana se congela o no mientras tanto.
 */

let trabajador: Worker | null = null;
let roto = false;
let siguiente = 0;
const pendientes = new Map<number, { ok: (a: FileAnalysis) => void; mal: (e: Error) => void }>();

function arrancar(): Worker | null {
  if (trabajador || roto) return trabajador;
  try {
    trabajador = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' });
    trabajador.onmessage = (e: MessageEvent<{ id: number; analisis?: FileAnalysis; error?: string }>) => {
      const p = pendientes.get(e.data.id);
      if (!p) return;
      pendientes.delete(e.data.id);
      if (e.data.error) p.mal(new Error(e.data.error));
      else p.ok(e.data.analisis!);
    };
    trabajador.onerror = () => {
      // Si el trabajador no llega a arrancar, todo lo pendiente se repite
      // aquí. No se pierde ningún archivo.
      roto = true;
      trabajador?.terminate();
      trabajador = null;
      for (const p of pendientes.values()) p.mal(new Error('trabajador-no-disponible'));
      pendientes.clear();
    };
    const base = new URL(`${import.meta.env.BASE_URL}gramaticas/`, location.href).href;
    trabajador.postMessage({ id: siguiente++, baseGramaticas: base });
  } catch {
    roto = true;
    trabajador = null;
  }
  return trabajador;
}

export async function analizarEnSegundoPlano(ruta: string, contenido: string): Promise<FileAnalysis> {
  const w = arrancar();
  if (!w) return analizarArchivo(ruta, contenido);
  const id = siguiente++;
  try {
    return await new Promise<FileAnalysis>((ok, mal) => {
      pendientes.set(id, { ok, mal });
      w.postMessage({ id, ruta, contenido });
    });
  } catch (err) {
    if ((err as Error).message === 'trabajador-no-disponible') return analizarArchivo(ruta, contenido);
    throw err;
  }
}
