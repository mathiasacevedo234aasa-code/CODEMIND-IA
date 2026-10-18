import { Fragment } from 'react';
import { useStore } from '../state/useStore';

/** Antepone el número de línea a cada línea, para que la IA pueda citar con exactitud. */
export function numerarLineas(texto: string, maxCaracteres = 12000): string {
  const lineas = texto.slice(0, maxCaracteres).split('\n');
  const ancho = String(lineas.length).length;
  return lineas.map((l, i) => `${String(i + 1).padStart(ancho)}| ${l}`).join('\n');
}

const CITA = /([\w./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;

/**
 * El texto de una respuesta con las citas "ruta:línea" convertidas en enlaces
 * que abren el archivo en esa línea. Solo se enlaza si el archivo existe en
 * el proyecto: una cita a algo que no está se queda como texto.
 */
export function TextoConCitas({ texto }: { texto: string }) {
  const analysis = useStore((s) => s.analysis);
  const files = useStore((s) => s.files);
  const existe = (ruta: string) => Boolean(analysis[ruta] || files[ruta]);

  const partes: (string | { ruta: string; linea: number; textoOriginal: string })[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(CITA)) {
    const ruta = m[1].replace(/^\.\//, '');
    if (!existe(ruta)) continue;
    partes.push(texto.slice(ultimo, m.index));
    partes.push({ ruta, linea: Number(m[2]), textoOriginal: m[0] });
    ultimo = (m.index ?? 0) + m[0].length;
  }
  partes.push(texto.slice(ultimo));

  const ir = async (ruta: string, linea: number) => {
    const st = useStore.getState();
    await st.openFile(ruta);
    st.jumpToLine(ruta, linea);
  };

  return (
    <>
      {partes.map((p, i) => (typeof p === 'string'
        ? <Fragment key={i}>{p}</Fragment>
        : (
          <button key={i} className="cita" title={`Abrir ${p.ruta} en la línea ${p.linea}`} onClick={() => void ir(p.ruta, p.linea)}>
            {p.textoOriginal}
          </button>
        )))}
    </>
  );
}
