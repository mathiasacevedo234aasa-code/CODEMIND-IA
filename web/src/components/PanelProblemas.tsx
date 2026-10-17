import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { explicarError } from '../lib/explicarError';

type Origen = 'editor' | 'analizador' | 'consola' | 'comprobaciones';
interface Problema { origen: Origen; nivel: 'error' | 'aviso'; ruta: string | null; linea: number | null; mensaje: string }

const NOMBRE: Record<Origen, string> = {
  editor: 'Editor',
  analizador: 'Analizador',
  consola: 'Consola',
  comprobaciones: 'Comprobaciones',
};

/**
 * Todos los problemas en una lista: lo que marca el editor en los archivos
 * abiertos, lo que el analizador no pudo leer, y los errores y avisos de la
 * consola y de Comprobaciones. Se filtra por origen, gravedad y texto, y
 * pulsar uno lleva a su línea.
 */
export function PanelProblemas() {
  const marcadores = useStore((s) => s.marcadores);
  const analysis = useStore((s) => s.analysis);
  const logs = useStore((s) => s.logs);
  const openFile = useStore((s) => s.openFile);
  const jumpToLine = useStore((s) => s.jumpToLine);
  const [origen, setOrigen] = useState<Origen | ''>('');
  const [soloErrores, setSoloErrores] = useState(false);
  const [texto, setTexto] = useState('');

  const todos = useMemo(() => {
    const lista: Problema[] = [];
    for (const [ruta, ms] of Object.entries(marcadores)) {
      for (const m of ms) lista.push({ origen: 'editor', nivel: m.nivel, ruta, linea: m.linea, mensaje: m.mensaje });
    }
    for (const [ruta, a] of Object.entries(analysis)) {
      if (a.error) lista.push({ origen: 'analizador', nivel: 'aviso', ruta, linea: null, mensaje: a.error });
    }
    // De los registros, solo errores y avisos. Los avisos de sintaxis del
    // editor ya están arriba con más detalle: no se repiten.
    for (const l of logs) {
      if (l.level !== 'error' && l.level !== 'warn') continue;
      const deChecks = l.channel === 'errores';
      if (!deChecks && l.channel !== 'console') continue;
      const m = /^([\w./\\-]+\.\w+):(\d+)\s+(.*)$/s.exec(l.message);
      // El aviso de sintaxis que el editor también escribe en el registro ya
      // está arriba, con más detalle: no se repite.
      if (m && marcadores[m[1]]?.some((x) => x.linea === Number(m[2]) && m[3].startsWith(x.mensaje))) continue;
      lista.push({
        origen: deChecks ? 'comprobaciones' : 'consola',
        nivel: l.level === 'error' ? 'error' : 'aviso',
        ruta: m ? m[1] : null,
        linea: m ? Number(m[2]) : null,
        mensaje: m ? m[3] : l.message,
      });
    }
    return lista;
  }, [marcadores, analysis, logs]);

  const q = texto.trim().toLowerCase();
  const vistos = todos.filter((p) =>
    (!origen || p.origen === origen)
    && (!soloErrores || p.nivel === 'error')
    && (!q || p.mensaje.toLowerCase().includes(q) || (p.ruta ?? '').toLowerCase().includes(q)));

  const ir = async (p: Problema) => {
    if (!p.ruta) return;
    await openFile(p.ruta);
    if (p.linea) jumpToLine(p.ruta, p.linea);
  };

  return (
    <div className="problemas">
      <div className="problemas-filtros">
        <select value={origen} onChange={(e) => setOrigen(e.target.value as Origen | '')}>
          <option value="">Todos los orígenes</option>
          {(Object.keys(NOMBRE) as Origen[]).map((o) => (
            <option key={o} value={o}>{NOMBRE[o]} ({todos.filter((p) => p.origen === o).length})</option>
          ))}
        </select>
        <label className="hint" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} />
          Solo errores
        </label>
        <input placeholder="Filtrar por texto o archivo..." value={texto} onChange={(e) => setTexto(e.target.value)} />
        <span className="hint">{vistos.length} de {todos.length}</span>
      </div>
      {vistos.length === 0 ? (
        <p className="hint" style={{ padding: 8 }}>{todos.length ? 'Ninguno coincide con el filtro.' : 'Sin problemas detectados.'}</p>
      ) : vistos.map((p, i) => (
        <div key={i} className={`problema ${p.ruta ? 'con-ruta' : ''}`} onClick={() => void ir(p)}>
          <span className={`tag ${p.nivel === 'error' ? 'warn' : 'muted'}`}>{p.nivel}</span>
          <span className="tag muted">{NOMBRE[p.origen]}</span>
          {p.ruta && <code>{p.ruta}{p.linea ? `:${p.linea}` : ''}</code>}
          <span className="msg">{p.mensaje}</span>
          <button
            className="btn sm outline"
            title="La IA explica la causa probable. No toca tu código."
            onClick={(e) => { e.stopPropagation(); void explicarError(p.mensaje, { archivo: p.ruta ?? undefined, linea: p.linea ?? undefined }); }}
          >
            Explicar
          </button>
        </div>
      ))}
    </div>
  );
}
