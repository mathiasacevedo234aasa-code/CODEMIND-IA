import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { calcularPosiciones, construirMapa, type MapaProyecto } from '../lib/projectMap';
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
  /** Archivo elegido para el análisis de impacto. */
  const [elegido, setElegido] = useState<string | null>(null);
  const [filtroCarpeta, setFiltroCarpeta] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<SymbolCategory | ''>('');
  const lienzo = useRef<SVGSVGElement | null>(null);

  const documentados = useMemo(
    () => new Set(Object.values(approved).map((d) => d.functionId)),
    [approved],
  );

  const completo = useMemo(() => construirMapa(analysis, documentados), [analysis, documentados]);
  const carpetas = useMemo(() => [...new Set(completo.nodos.filter((n) => !n.externo).map((n) => n.carpeta))].sort(), [completo]);
  // Los filtros quitan nodos, y con ellos las flechas que ya no tienen los dos extremos.
  const mapa: MapaProyecto = useMemo(() => {
    if (!filtroCarpeta && !filtroTipo) return completo;
    const nodos = completo.nodos.filter((n) =>
      (!filtroCarpeta || n.carpeta === filtroCarpeta) && (!filtroTipo || n.categoria === filtroTipo));
    const quedan = new Set(nodos.map((n) => n.path));
    return { ...completo, nodos, aristas: completo.aristas.filter((a) => quedan.has(a.desde) && quedan.has(a.hasta)) };
  }, [completo, filtroCarpeta, filtroTipo]);

  /**
   * Análisis de impacto: todo lo que depende del elegido, directa o
   * indirectamente. Se calcula sobre el mapa COMPLETO (un filtro no hace que
   * algo deje de depender), y se dice cuántos quedan fuera de la vista.
   */
  const impacto = useMemo(() => {
    if (!elegido) return null;
    const afectados = new Map<string, number>();
    let frontera = [elegido];
    for (let nivel = 1; frontera.length; nivel++) {
      const siguiente: string[] = [];
      for (const objetivo of frontera) {
        for (const a of completo.aristas) {
          if (a.hasta === objetivo && a.desde !== elegido && !afectados.has(a.desde)) {
            afectados.set(a.desde, nivel);
            siguiente.push(a.desde);
          }
        }
      }
      frontera = siguiente;
    }
    return afectados;
  }, [elegido, completo]);
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
  const enImpacto = (ruta: string) => ruta === elegido || Boolean(impacto?.has(ruta));
  const relacionada = (desde: string, hasta: string) =>
    impacto ? enImpacto(desde) && enImpacto(hasta) : !encima || desde === encima || hasta === encima;

  /**
   * Exporta lo que se ve. El SVG del mapa usa variables CSS del tema, que
   * fuera de la aplicación no existen: se sustituyen por su valor real.
   */
  const exportar = async (formato: 'svg' | 'png') => {
    const svg = lienzo.current;
    if (!svg) return;
    const estilos = getComputedStyle(document.documentElement);
    const copia = svg.cloneNode(true) as SVGSVGElement;
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copia.setAttribute('width', String(ANCHO));
    copia.setAttribute('height', String(ALTO));
    const fondo = estilos.getPropertyValue('--bg').trim() || '#ffffff';
    copia.insertAdjacentHTML('afterbegin', `<rect width="100%" height="100%" fill="${fondo}"/>`);
    copia.querySelectorAll('.mapa-etiqueta').forEach((t) => {
      t.setAttribute('font-family', 'system-ui, sans-serif');
      t.setAttribute('font-size', '11');
      t.setAttribute('fill', estilos.getPropertyValue('--text-dim').trim() || '#555');
    });
    const texto = new XMLSerializer().serializeToString(copia)
      .replace(/var\((--[\w-]+)\)/g, (_, v: string) => estilos.getPropertyValue(v).trim() || '#888');
    const nombre = `mapa-${(filtroCarpeta || 'proyecto').replace(/[^\w-]+/g, '_')}`;
    const descargar = (blob: Blob, ext: string) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${nombre}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const blobSvg = new Blob([texto], { type: 'image/svg+xml' });
    if (formato === 'svg') return descargar(blobSvg, 'svg');
    // PNG al doble de resolución, para que se lea bien en un documento.
    const img = new Image();
    img.src = URL.createObjectURL(blobSvg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ANCHO * 2;
    canvas.height = ALTO * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);
    canvas.toBlob((b) => b && descargar(b, 'png'), 'image/png');
  };

  const abrir = (ruta: string) => {
    void openFile(ruta);
    setDocCenterOpen(false);
  };

  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>
        Cada círculo es un archivo; su tamaño, la cantidad de elementos que contiene. Las flechas van
        del archivo que depende al archivo del que depende. Pasa el cursor para aislar sus conexiones,
        pulsa para ver todo lo que se vería afectado si lo cambias y haz doble clic para abrirlo.
      </p>

      <div className="mapa-filtros">
        <select value={filtroCarpeta} onChange={(e) => setFiltroCarpeta(e.target.value)} title="Filtrar por carpeta">
          <option value="">Todas las carpetas</option>
          {carpetas.map((c) => <option key={c} value={c}>{c || '(raíz)'}</option>)}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as SymbolCategory | '')} title="Filtrar por tipo de archivo">
          <option value="">Todos los tipos</option>
          {(Object.keys(ETIQUETA) as SymbolCategory[]).map((c) => <option key={c} value={c}>{ETIQUETA[c]}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" onClick={() => void exportar('svg')}>Exportar SVG</button>
        <button className="btn sm outline" onClick={() => void exportar('png')}>Exportar PNG</button>
      </div>

      {elegido && impacto && (
        <div className="review-banner mapa-impacto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Si cambias {elegido.split('/').pop()}:</strong>
            <span>{impacto.size ? `${impacto.size} archivo(s) dependen de él` : 'ningún archivo depende de él'}</span>
            <span style={{ flex: 1 }} />
            <button className="btn sm outline" onClick={() => abrir(elegido)}>Abrir</button>
            <button className="btn icon sm" title="Quitar la selección" onClick={() => setElegido(null)}><Icon name="close" size={11} /></button>
          </div>
          {[...impacto].sort((a, b) => a[1] - b[1]).slice(0, 12).map(([ruta, nivel]) => (
            <div key={ruta} className="mapa-fila" onClick={() => abrir(ruta)}>
              <code>{ruta}</code>
              <span className="tag muted">{nivel === 1 ? 'directo' : `a ${nivel} saltos`}</span>
              {!mapa.nodos.some((n) => n.path === ruta) && <span className="tag warn">fuera del filtro</span>}
            </div>
          ))}
          {impacto.size > 12 && <p className="hint">y {impacto.size - 12} más.</p>}
        </div>
      )}

      <div className="mapa-leyenda">
        {(Object.keys(COLOR) as SymbolCategory[]).map((c) => (
          <span key={c}><i style={{ background: COLOR[c] }} /> {ETIQUETA[c]}</span>
        ))}
        <span style={{ flex: 1 }} />
        <span>{mapa.nodos.length} archivo(s) · {mapa.aristas.length} dependencia(s)</span>
      </div>

      <div className="mapa-lienzo">
        <svg ref={lienzo} viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" role="img" aria-label="Mapa de dependencias del proyecto">
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
            const activa = (Boolean(encima) || Boolean(impacto)) && relacionada(a.desde, a.hasta);

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
            const atenuado = impacto
              ? !enImpacto(nodo.path)
              : Boolean(encima) && encima !== nodo.path &&
                !mapa.aristas.some((a) =>
                  (a.desde === encima && a.hasta === nodo.path) || (a.hasta === encima && a.desde === nodo.path));

            return (
              <g
                key={nodo.path}
                className="mapa-nodo"
                opacity={atenuado ? 0.2 : 1}
                onMouseEnter={() => setEncima(nodo.path)}
                onMouseLeave={() => setEncima(null)}
                onClick={() => setElegido(elegido === nodo.path ? null : nodo.path)}
                onDoubleClick={() => abrir(nodo.path)}
              >
                <circle cx={pos.x} cy={pos.y} r={r} fill={COLOR[nodo.categoria]} opacity={0.85} />
                {nodo.path === elegido && <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none" stroke="var(--accent)" strokeWidth="2.5" />}
                {impacto?.has(nodo.path) && <circle cx={pos.x} cy={pos.y} r={r + 5} fill="none" stroke="var(--bad)" strokeWidth="2" strokeDasharray="3 2" />}
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
