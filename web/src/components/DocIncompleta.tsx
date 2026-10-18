import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import type { DetectedSymbol } from '../lib/types';

/**
 * Lo que le falta a la documentación del proyecto, en un sitio: lo que nunca
 * se documentó y lo que se documentó pero cuyo código cambió después.
 *
 * Desde aquí se lanza en lote (va en segundo plano, con su tarjeta de
 * progreso, pausa y cancelar) o se va a cada elemento. Todo lo que genere la
 * IA llega a Revisión: nada es oficial hasta que lo apruebes.
 */
export function DocIncompleta() {
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const proposals = useStore((s) => s.proposals);
  const statusOf = useStore((s) => s.statusOf);
  const documentarArchivo = useStore((s) => s.documentarArchivo);
  const goToSymbol = useStore((s) => s.goToSymbol);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);
  const cola = useStore((s) => s.colaDoc);

  const { sinDoc, desactualizados, enRevision } = useMemo(() => {
    const sinDoc: DetectedSymbol[] = [];
    const desactualizados: DetectedSymbol[] = [];
    let enRevision = 0;
    for (const x of symbolsFn()) {
      if (x.menor) continue;
      if (proposals.some((p) => p.functionId === x.id)) { enRevision++; continue; }
      const estado = statusOf(x);
      if (estado === 'sin-documentar') sinDoc.push(x);
      else if (estado === 'revisar') desactualizados.push(x);
    }
    return { sinDoc, desactualizados, enRevision };
  }, [symbolsFn, analysis, approved, proposals, statusOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const porArchivo = (lista: DetectedSymbol[]) => {
    const m = new Map<string, DetectedSymbol[]>();
    for (const x of lista) m.set(x.filePath, [...(m.get(x.filePath) ?? []), x]);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  };

  const ir = (x: DetectedSymbol) => { setDocCenterOpen(false); void goToSymbol(x); };
  const ocupado = Boolean(cola?.activa);

  const Grupo = ({ titulo, lista, etiqueta }: { titulo: string; lista: DetectedSymbol[]; etiqueta: string }) => (
    <div className="card" style={{ marginTop: 12 }}>
      <h4>{titulo} ({lista.length})</h4>
      {porArchivo(lista).map(([ruta, xs]) => (
        <div key={ruta} style={{ marginBottom: 6 }}>
          <code style={{ fontSize: 12 }}>{ruta}</code>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {xs.map((x) => (
              <button key={x.id} className="btn sm outline" title={`${x.kind}, línea ${x.line}`} onClick={() => ir(x)}>
                {x.qualifiedName} <span className={`tag ${etiqueta}`} style={{ marginLeft: 4 }}>{x.line}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <p className="hint">
        Lo que no tiene documentación y lo que la tiene desactualizada (el código cambió después de aprobarla).
        {enRevision > 0 && ` Hay ${enRevision} propuesta(s) esperando en Revisión, que no se cuentan aquí.`}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn primary"
          disabled={ocupado || !sinDoc.length}
          onClick={() => {
            if (window.confirm(`Se pedirá a la IA la documentación de ${sinDoc.length} elemento(s), uno detrás de otro, en segundo plano. Todo llega a Revisión. ¿Empezar?`)) {
              void documentarArchivo('', { carpeta: true });
            }
          }}
        >
          Documentar los {sinDoc.length} que faltan
        </button>
        <button
          className="btn outline"
          disabled={ocupado || !desactualizados.length}
          onClick={() => {
            if (window.confirm(`Se pedirá una versión nueva de ${desactualizados.length} documentación(es) desactualizada(s), y también de lo que falte. La aprobada sigue siendo la oficial hasta que apruebes la nueva. ¿Empezar?`)) {
              void documentarArchivo('', { carpeta: true, desactualizados: true });
            }
          }}
        >
          Actualizar las {desactualizados.length} desactualizadas
        </button>
      </div>
      {ocupado && <p className="hint">Hay una cola en marcha: su progreso está en la tarjeta de abajo a la izquierda.</p>}
      {!sinDoc.length && !desactualizados.length && <p className="hint" style={{ marginTop: 12 }}>Todo lo detectado está documentado y al día.</p>}
      {desactualizados.length > 0 && <Grupo titulo="Desactualizada" lista={desactualizados} etiqueta="warn" />}
      {sinDoc.length > 0 && <Grupo titulo="Sin documentar" lista={sinDoc} etiqueta="muted" />}
    </>
  );
}
