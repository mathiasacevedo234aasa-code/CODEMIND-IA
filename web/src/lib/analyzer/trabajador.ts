/// <reference lib="webworker" />
import { analizarArchivo } from './index.ts';
import { usarGramaticasDesde } from './treesitter.ts';

/**
 * El análisis del proyecto entero, fuera del hilo de la interfaz.
 *
 * Con cientos de archivos (y gramáticas de varios megabytes que compilar) el
 * análisis inicial congelaba la ventana unos segundos: ni se podía escribir ni
 * hacer scroll. Aquí trabaja en paralelo y la interfaz sigue respondiendo.
 *
 * El análisis mientras escribes en el editor NO pasa por aquí: es un solo
 * archivo, se hace al instante y no compensa el viaje de ida y vuelta.
 */

interface Pedido { id: number; ruta?: string; contenido?: string; baseGramaticas?: string }

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const { id, ruta, contenido, baseGramaticas } = e.data;
  // Las rutas relativas de las gramáticas se resolverían contra la carpeta
  // del propio trabajador, que no es la de la aplicación: por eso la base
  // llega ya resuelta desde la página.
  if (baseGramaticas) {
    usarGramaticasDesde(baseGramaticas);
    (self as unknown as Worker).postMessage({ id, ok: true });
    return;
  }
  try {
    const analisis = await analizarArchivo(ruta!, contenido!);
    (self as unknown as Worker).postMessage({ id, analisis });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
