import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { calcularPosiciones, construirMapa } from '../lib/projectMap';
import type { SymbolCategory } from '../lib/types';
import { Icon } from './Icon';

const ANCHO = 880;
const ALTO = 460;

const COLOR: Record<SymbolCategory, string> = {
  codigo: 'var(--accent)',
  estructura: 'var(--warn)',
  estilo: '#cf649a',
  contenido: 'var(--ok)',
};

const ETIQUETA: Record<SymbolCategory, string> = {
  codigo: 'Código',
  estructura: 'Estructura',
  estilo: 'Estilos',
  contenido: 'Contenido',
};

/**
 * Mapa de dependencias del proyecto.
 *
 * Las flechas salen de hechos comprobables —los `import`, los `<script src>`,
 * los `<link href>` y los `@import`—, nunca de suposiciones. Lo que no se
 * puede resolver aparece como dependencia externa, no como una flecha
 * inventada.
 */
export function ProjectMap() {
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const openFile = useStore((s) => s.openFile);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);

  const [encima, setEncima] = useState<string | null>(null);

  const documentados = useMemo(
    () => new Set(Object.values(approved).map((d) => d.functionId)),
    [approved],
  );

  const mapa = useMemo(() => construirMapa(analysis, documentados), [analysis, documentados]);
  const posiciones = useMemo(() => calcularPosiciones(mapa, ANCHO, ALTO), [mapa]);
  const posicionDe = useMemo(() => new Map(posiciones.map((p) => [p.path, p])), [posiciones]);

  if (!mapa.nodos.length) {
    return (
      <p className="hint">
        Todavía no hay archivos analizados. El mapa aparece en cuanto el proyecto tenga código, estilos o páginas.
      </p>
    );
  }

  const radio = (simbolos: number) => Math.max(7, Math.min(20, 7 + Math.sqrt(simbolos) * 2.6));

  /** Aristas relacionadas con el nodo señalado, para destacar su vecindad. */
  const relacionada = (desde: string, hasta: string) =>
    !encima || desde === encima || hasta === encima;

  const abrir = (ruta: string) => {
    void openFile(ruta);
    setDocCenterOpen(false);
  };

  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>
        Cada círculo es un archivo; su tamaño, la cantidad de elementos que contiene. Las flechas van
        del archivo que depende al archivo del que depende. Pasa el cursor para aislar sus conexiones
        y pulsa para abrirlo.
      </p>

      <div className="mapa-leyenda">
        {(Object.keys(COLOR) as SymbolCategory[]).map((c) => (
          <span key={c}><i style={{ background: COLOR[c] }} /> {ETIQUETA[c]}</span>
        ))}
        <span style={{ flex: 1 }} />
        <span>{mapa.nodos.length} archivo(s) · {mapa.aristas.length} dependencia(s)</span>
      </div>

      <div className="mapa-lienzo">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" role="img" aria-label="Mapa de dependencias del proyecto">
          <defs>
            <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
            </marker>
            <marker id="punta-activa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {mapa.aristas.map((a) => {
            const desde = posicionDe.get(a.desde);
            const hasta = posicionDe.get(a.hasta);
            if (!desde || !hasta) return null;

            // La flecha se detiene en el borde del círculo, no en su centro.
            const nodoDestino = mapa.nodos.find((n) => n.path === a.hasta)!;
            const dx = hasta.x - desde.x;
            const dy = hasta.y - desde.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const margen = radio(nodoDestino.simbolos) + 6;
            const activa = Boolean(encima) && relacionada(a.desde, a.hasta);

            return (
              <line
                key={`${a.desde}->${a.hasta}`}
                x1={desde.x}
                y1={desde.y}
                x2={hasta.x - (dx / d) * margen}
                y2={hasta.y - (dy / d) * margen}
                stroke={activa ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={activa ? 1.8 : 1}
                opacity={relacionada(a.desde, a.hasta) ? 0.9 : 0.12}
                markerEnd={activa ? 'url(#punta-activa)' : 'url(#punta)'}
              >
                <title>{`${a.desde} → ${a.hasta}  (${a.via})`}</title>
              </line>
            );
          })}

          {mapa.nodos.map((nodo) => {
            const pos = posicionDe.get(nodo.path);
            if (!pos) return null;
            const r = radio(nodo.simbolos);
            const atenuado = Boolean(encima) && encima !== nodo.path &&
              !mapa.aristas.some((a) =>
                (a.desde === encima && a.hasta === nodo.path) || (a.hasta === encima && a.desde === nodo.path));

            return (
              <g
                key={nodo.path}
                className="mapa-nodo"
                opacity={atenuado ? 0.2 : 1}
                onMouseEnter={() => setEncima(nodo.path)}
                onMouseLeave={() => setEncima(null)}
                onClick={() => abrir(nodo.path)}
              >
                <circle cx={pos.x} cy={pos.y} r={r} fill={COLOR[nodo.categoria]} opacity={0.85} />
                {nodo.documentados > 0 && (
                  <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="var(--ok)" strokeWidth="1.5" />
                )}
                <text x={pos.x} y={pos.y + r + 12} textAnchor="middle" className="mapa-etiqueta">
                  {nodo.path.split('/').pop()}
                </text>
                <title>
                  {`${nodo.path}\n${nodo.simbolos} elemento(s), ${nodo.documentados} documentado(s)\n${nodo.entrantes} archivo(s) dependen de él · depende de ${nodo.salientes}`}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        {mapa.masUsados.length > 0 && (
          <div className="card">
            <h4>Archivos de los que más depende el proyecto</h4>
            {mapa.masUsados.map((f) => (
              <div key={f.path} className="mapa-fila" onClick={() => abrir(f.path)}>
                <code>{f.path}</code>
                <span className="tag info">{f.entrantes}</span>
              </div>
            ))}
            <p className="hint">Tocar estos archivos afecta a muchos otros.</p>
          </div>
        )}

        {mapa.sinEntradas.length > 0 && (
          <div className="card">
            <h4>Archivos que nadie importa</h4>
            {mapa.sinEntradas.slice(0, 8).map((p) => (
              <div key={p} className="mapa-fila" onClick={() => abrir(p)}>
                <code>{p}</code>
              </div>
            ))}
            <p className="hint">
              Puede ser normal: los puntos de entrada y los archivos que se cargan desde el HTML no los
              importa nadie. Aquí solo se señala dónde mirar.
            </p>
          </div>
        )}
      </div>

      {mapa.ciclos.length > 0 && (
        <div className="review-banner" style={{ marginTop: 12, borderColor: 'var(--warn)' }}>
          <strong>{mapa.ciclos.length} dependencia(s) circular(es).</strong> No es un error por sí mismo,
          pero explica bastantes comportamientos raros al cargar módulos.
          {mapa.ciclos.slice(0, 4).map((ciclo, i) => (
            <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 11.5, marginTop: 4 }}>
              {[...ciclo, ciclo[0]].join(' → ')}
            </div>
          ))}
        </div>
      )}

      {mapa.externos.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4>Dependencias externas</h4>
          <p className="meta">
            Paquetes que el proyecto usa pero que no forman parte de él:{' '}
            {mapa.externos.map((e) => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}
          </p>
        </div>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        <Icon name="warn" size={12} /> El mapa solo dibuja relaciones que están escritas en el código.
        Una dependencia cargada dinámicamente o por nombre no aparece aquí.
      </p>
    </>
  );
}
