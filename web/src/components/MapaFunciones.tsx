import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { construirLlamadas } from '../lib/llamadas';
import type { DetectedSymbol } from '../lib/types';
import { Icon } from './Icon';

const ANCHO = 880;
const ALTO = 460;
const PALETA = ['#5b8cff', '#3fb984', '#d9a441', '#cf649a', '#56b6c2', '#e06c75', '#a07cdf', '#8dc891'];

/**
 * Mapa entre funciones (quién llama a quién) y árbol de llamadas de una.
 * Las funciones se agrupan por archivo y cada archivo tiene su color.
 */
export function MapaFunciones() {
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const [elegida, setElegida] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const { funciones, llamadas } = useMemo(() => construirLlamadas(symbolsFn()), [symbolsFn, analysis]); // eslint-disable-line react-hooks/exhaustive-deps
  const porId = useMemo(() => new Map(funciones.map((f) => [f.id, f])), [funciones]);
  const archivos = useMemo(() => [...new Set(funciones.map((f) => f.filePath))].sort(), [funciones]);
  const color = (ruta: string) => PALETA[archivos.indexOf(ruta) % PALETA.length];

  // Disposición: un sector por archivo alrededor de un círculo, sus funciones juntas.
  const posiciones = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    const total = funciones.length || 1;
    let i = 0;
    for (const ruta of archivos) {
      for (const f of funciones.filter((x) => x.filePath === ruta)) {
        const a = (i / total) * Math.PI * 2 - Math.PI / 2;
        m.set(f.id, { x: ANCHO / 2 + Math.cos(a) * (ANCHO / 2 - 110), y: ALTO / 2 + Math.sin(a) * (ALTO / 2 - 40) });
        i++;
      }
    }
    return m;
  }, [funciones, archivos]);

  if (!funciones.length) return <p className="hint">No se han detectado funciones en el proyecto.</p>;

  const q = busqueda.trim().toLowerCase();
  const encontrada = q ? funciones.find((f) => f.name.toLowerCase().includes(q)) : null;
  const foco = elegida ?? encontrada?.id ?? null;
  const relacionada = (id: string) => !foco || id === foco || llamadas.some((l) => (l.desde === foco && l.hasta === id) || (l.hasta === foco && l.desde === id));

  const ir = async (f: DetectedSymbol) => {
    const st = useStore.getState();
    st.setDocCenterOpen(false);
    await st.goToSymbol(f);
  };

  return (
    <>
      <div className="mapa-filtros">
        <input placeholder="Buscar una función…" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setElegida(null); }} style={{ maxWidth: 240 }} />
        <span className="hint">{funciones.length} funciones · {llamadas.length} llamadas detectadas</span>
      </div>
      <div className="mapa-leyenda">
        {archivos.map((r) => <span key={r}><i style={{ background: color(r) }} /> {r}</span>)}
      </div>
      <div className="mapa-lienzo">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" role="img" aria-label="Mapa de llamadas entre funciones">
          <defs>
            <marker id="punta-fn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>
          {llamadas.map((l) => {
            const a = posiciones.get(l.desde);
            const b = posiciones.get(l.hasta);
            if (!a || !b) return null;
            const activa = Boolean(foco) && (l.desde === foco || l.hasta === foco);
            const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
            return (
              <line key={`${l.desde}>${l.hasta}`} x1={a.x} y1={a.y} x2={b.x - (dx / d) * 10} y2={b.y - (dy / d) * 10}
                stroke={activa ? 'var(--accent)' : 'var(--border-strong)'} strokeWidth={activa ? 1.8 : 1}
                opacity={!foco || activa ? 0.85 : 0.1} markerEnd="url(#punta-fn)" />
            );
          })}
          {funciones.map((f) => {
            const p = posiciones.get(f.id)!;
            return (
              <g key={f.id} className="mapa-nodo" opacity={relacionada(f.id) ? 1 : 0.18}
                onClick={() => setElegida(elegida === f.id ? null : f.id)} onDoubleClick={() => void ir(f)}>
                <circle cx={p.x} cy={p.y} r={f.id === foco ? 9 : 6} fill={color(f.filePath)} />
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="mapa-etiqueta">{f.name}</text>
                <title>{`${f.qualifiedName} — ${f.filePath}:${f.line}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {foco && porId.get(foco) && <ArbolLlamadas raiz={porId.get(foco)!} porId={porId} llamadas={llamadas} ir={ir} />}
      <p className="hint">Pulsa una función para ver su árbol de llamadas; doble clic para abrirla. Las llamadas se detectan por nombre: las dinámicas no aparecen.</p>
    </>
  );
}

/** Árbol de llamadas: lo que llama (desplegable) y quién la llama. */
function ArbolLlamadas({ raiz, porId, llamadas, ir }: {
  raiz: DetectedSymbol;
  porId: Map<string, DetectedSymbol>;
  llamadas: { desde: string; hasta: string }[];
  ir: (f: DetectedSymbol) => void;
}) {
  const quienes = llamadas.filter((l) => l.hasta === raiz.id).map((l) => porId.get(l.desde)).filter(Boolean) as DetectedSymbol[];
  return (
    <div className="grid2" style={{ marginTop: 10, alignItems: 'start' }}>
      <div className="card">
        <h4>{raiz.name} llama a</h4>
        <Rama id={raiz.id} porId={porId} llamadas={llamadas} ir={ir} visitados={new Set([raiz.id])} nivel={0} />
      </div>
      <div className="card">
        <h4>Llaman a {raiz.name}</h4>
        {quienes.length ? quienes.map((f) => (
          <div key={f.id} className="mapa-fila" onClick={() => ir(f)}><code>{f.name}</code><span className="hint">{f.filePath}:{f.line}</span></div>
        )) : <p className="hint">Nadie (o la llamada no es por nombre).</p>}
      </div>
    </div>
  );
}

function Rama({ id, porId, llamadas, ir, visitados, nivel }: {
  id: string;
  porId: Map<string, DetectedSymbol>;
  llamadas: { desde: string; hasta: string }[];
  ir: (f: DetectedSymbol) => void;
  visitados: Set<string>;
  nivel: number;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const hijos = llamadas.filter((l) => l.desde === id).map((l) => porId.get(l.hasta)).filter(Boolean) as DetectedSymbol[];
  if (!hijos.length) return nivel === 0 ? <p className="hint">No llama a otras funciones del proyecto.</p> : null;
  return (
    <div style={{ paddingLeft: nivel ? 14 : 0 }}>
      {hijos.map((f) => {
        const ciclo = visitados.has(f.id);
        const abierto = abiertos.has(f.id);
        return (
          <div key={f.id}>
            <div className="mapa-fila">
              <button className="btn icon sm" disabled={ciclo} onClick={() => setAbiertos((s) => { const n = new Set(s); if (abierto) n.delete(f.id); else n.add(f.id); return n; })}>
                <Icon name={abierto ? 'chevronDown' : 'chevronRight'} size={11} />
              </button>
              <code onClick={() => ir(f)} style={{ cursor: 'pointer' }}>{f.name}</code>
              <span className="hint">{ciclo ? '(recursiva)' : `${f.filePath}:${f.line}`}</span>
            </div>
            {abierto && !ciclo && <Rama id={f.id} porId={porId} llamadas={llamadas} ir={ir} visitados={new Set([...visitados, f.id])} nivel={nivel + 1} />}
          </div>
        );
      })}
    </div>
  );
}
