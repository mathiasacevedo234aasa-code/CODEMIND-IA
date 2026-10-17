import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type EjecucionResumen } from '../lib/api';
import { Icon } from './Icon';

const duracion = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`);

/**
 * Historial de ejecuciones del panel Ejecutar: duración, código de salida y la
 * salida guardada. Marcando dos se comparan lado a lado.
 */
export function HistorialEjecuciones() {
  const project = useStore((s) => s.project);
  const setComparacion = useStore((s) => s.setComparacion);
  const [lista, setLista] = useState<EjecucionResumen[]>([]);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [viendo, setViendo] = useState<{ titulo: string; salida: string } | null>(null);

  useEffect(() => {
    if (!project) return;
    const cargar = () => api.ejecuciones(project.id).then((r) => setLista(r.ejecuciones)).catch(() => {});
    void cargar();
    // Las ejecuciones terminan solas: se refresca de vez en cuando.
    const t = window.setInterval(cargar, 4000);
    return () => window.clearInterval(t);
  }, [project]);

  if (!project || !lista.length) return null;

  const ver = async (e: EjecucionResumen) => {
    const { ejecucion } = await api.ejecucion(project.id, e.id);
    setViendo({ titulo: `${e.etiqueta} · ${new Date(e.inicio).toLocaleString()}`, salida: ejecucion.salida });
  };

  const comparar = () => {
    const [a, b] = marcadas.map((id) => lista.find((e) => e.id === id)!).sort((x, y) => x.inicio.localeCompare(y.inicio));
    setComparacion({
      ruta: 'salida.log',
      titulo: `${a.etiqueta} ${new Date(a.inicio).toLocaleTimeString()} ↔ ${new Date(b.inicio).toLocaleTimeString()}`,
      etiqueta: 'dos ejecuciones',
      cargar: async () => {
        const [x, y] = await Promise.all([api.ejecucion(project.id, a.id), api.ejecucion(project.id, b.id)]);
        return { binary: false, antes: x.ejecucion.salida, despues: y.ejecucion.salida };
      },
    });
    setMarcadas([]);
  };

  return (
    <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="panel-title">Historial de ejecuciones</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" disabled={marcadas.length !== 2} onClick={comparar} title="Marca dos ejecuciones para comparar su salida">
          Comparar
        </button>
      </div>
      {lista.slice(0, 20).map((e) => (
        <div key={e.id} className="stash-fila">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={marcadas.includes(e.id)}
            onChange={(ev) => setMarcadas((m) => (ev.target.checked ? [...m, e.id].slice(-2) : m.filter((x) => x !== e.id)))}
          />
          <span className={`tag ${e.codigo === 0 ? 'ok' : 'warn'}`}>{e.codigo === null ? '—' : e.codigo}</span>
          <span className="msg" title={e.comando}>{e.etiqueta}</span>
          <span className="hint">{duracion(e.ms)} · {new Date(e.inicio).toLocaleTimeString()}</span>
          <button className="btn sm outline" onClick={() => void ver(e)}>Salida</button>
        </div>
      ))}
      {viendo && (
        <div className="overlay" onClick={() => setViendo(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontSize: 14 }}>{viendo.titulo}</h2>
              <button className="btn icon" onClick={() => setViendo(null)}><Icon name="close" /></button>
            </div>
            <div className="modal-body"><pre className="log-raw">{viendo.salida || '(sin salida)'}</pre></div>
          </div>
        </div>
      )}
    </div>
  );
}
