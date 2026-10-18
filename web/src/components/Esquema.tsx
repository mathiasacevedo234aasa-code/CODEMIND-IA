import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import { Icon } from './Icon';

/**
 * Esquema flotante del archivo: sus elementos con la jerarquía real (un
 * método dentro de su clase), marcando el que contiene al cursor. Pulsar uno
 * lleva a su línea.
 */
export function Esquema({ ruta, alCerrar }: { ruta: string; alCerrar: () => void }) {
  const analysis = useStore((s) => s.analysis);
  const cursor = useStore((s) => s.cursor);
  const statusOf = useStore((s) => s.statusOf);
  const jumpToLine = useStore((s) => s.jumpToLine);

  const filas = useMemo(() => {
    const simbolos = (analysis[ruta]?.symbols ?? []).filter((x) => !x.menor).sort((a, b) => a.line - b.line);
    // Profundidad = cuántos otros elementos lo contienen.
    return simbolos.map((x) => ({
      x,
      nivel: simbolos.filter((o) => o !== x && o.line <= x.line && o.endLine >= x.endLine && (o.endLine - o.line) > (x.endLine - x.line)).length,
    }));
  }, [analysis, ruta]);

  const linea = cursor?.path === ruta ? cursor.line : null;
  const dentro = filas.filter((f) => linea !== null && f.x.line <= linea && f.x.endLine >= linea).pop()?.x.id;

  return (
    <div className="esquema" role="navigation" aria-label="Esquema del archivo">
      <div className="esquema-cab">
        <strong>Esquema</strong>
        <span className="hint">{filas.length}</span>
        <span style={{ flex: 1 }} />
        <button className="btn icon sm" onClick={alCerrar} title="Cerrar el esquema"><Icon name="close" size={11} /></button>
      </div>
      <div className="esquema-lista">
        {filas.length === 0 && <p className="hint" style={{ padding: 6 }}>No se han detectado elementos en este archivo.</p>}
        {filas.map(({ x, nivel }) => {
          const estado = statusOf(x);
          return (
            <button
              key={x.id}
              className={`esquema-fila ${x.id === dentro ? 'activa' : ''}`}
              style={{ paddingLeft: 6 + nivel * 12 }}
              title={`${x.kind}, línea ${x.line}`}
              onClick={() => jumpToLine(ruta, x.line)}
            >
              <span className={`punto-doc ${estado}`} />
              <span className="nombre">{x.name}</span>
              <span className="hint">{x.line}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
