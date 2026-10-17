import { useStore } from '../state/useStore';
import { api } from './api';

/**
 * "Explicar este error": manda al asistente el mensaje y, si se sabe de qué
 * archivo y línea viene, unas líneas de código alrededor.
 *
 * La IA explica la causa y dónde mirar; no propone el código arreglado. Eso
 * ya lo prohíben las reglas base del asistente, y se le recuerda aquí.
 */
export async function explicarError(mensaje: string, donde?: { archivo?: string; linea?: number }) {
  const estado = useStore.getState();
  let archivo = donde?.archivo;
  let linea = donde?.linea;

  // Muchos mensajes empiezan por "ruta:linea": se aprovecha si no vino aparte.
  if (!archivo) {
    const m = /^([\w./\\-]+\.\w+):(\d+)/.exec(mensaje.trim());
    if (m) { archivo = m[1].replace(/\\/g, '/'); linea = Number(m[2]); }
  }

  let fragmento = '';
  if (archivo && estado.project) {
    const contenido = estado.files[archivo]?.content
      ?? (await api.readFile(estado.project.id, archivo).catch(() => null))?.content;
    if (typeof contenido === 'string') {
      const lineas = contenido.split('\n');
      const centro = Math.max(1, Math.min(linea ?? 1, lineas.length));
      const desde = Math.max(1, centro - 15);
      const hasta = Math.min(lineas.length, centro + 15);
      const trozo = lineas.slice(desde - 1, hasta)
        .map((l, i) => `${String(desde + i).padStart(4)}${desde + i === centro ? ' >' : '  '} ${l}`)
        .join('\n');
      fragmento = `Código alrededor (${archivo}, líneas ${desde}-${hasta}; la marcada con > es la del error):\n\`\`\`\n${trozo}\n\`\`\``;
    }
  }

  const contexto = [`Mensaje de error:\n${mensaje.slice(0, 4000)}`, fragmento].filter(Boolean).join('\n\n');
  estado.askAssistant(
    'Explícame este error: qué lo causa probablemente y dónde mirar. No escribas el código corregido.',
    contexto,
  );
}
