import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { TextoConCitas } from './TextoConCitas';

/** Proveedores que se pueden usar ahora: con clave, o locales con modelo elegido. */
export function proveedoresListos() {
  const { proveedores, claves, settings } = useStore.getState();
  return proveedores.filter((p) => (p.local ? Boolean(settings.modelos?.[p.id]) : Boolean(claves[p.id]?.configured)));
}

/**
 * La misma pregunta, con el mismo contexto, a dos proveedores a la vez. Las
 * respuestas se ven una junto a otra. Cuenta como dos envíos en el gasto.
 */
export function CompararProveedores({ payload, alCerrar }: { payload: Record<string, unknown>; alCerrar: () => void }) {
  const settings = useStore((s) => s.settings);
  const listos = proveedoresListos();
  const [a, setA] = useState(settings.proveedor);
  const [b, setB] = useState(listos.find((p) => p.id !== settings.proveedor)?.id ?? '');
  const [respuestas, setRespuestas] = useState<{ proveedor: string; answer?: string; model?: string; error?: string }[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const lanzar = async () => {
    setOcupado(true);
    try {
      const r = await api.comparar({ ...payload, proveedores: [{ proveedor: a }, { proveedor: b }] });
      setRespuestas(r.respuestas);
    } catch (err) {
      setRespuestas([{ proveedor: a, error: (err as Error).message }]);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 14 }}>Comparar proveedores</h2>
          <select value={a} onChange={(e) => setA(e.target.value)} style={{ width: 'auto' }}>
            {listos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <span>vs</span>
          <select value={b} onChange={(e) => setB(e.target.value)} style={{ width: 'auto' }}>
            <option value="">—</option>
            {listos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button className="btn sm primary" disabled={ocupado || !a || !b || a === b} onClick={() => void lanzar()}>
            {ocupado ? <span className="spinner" /> : null} Preguntar a los dos
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {listos.length < 2 && (
            <p className="hint">Hace falta tener al menos dos proveedores configurados (con su clave, o Ollama con un modelo elegido).</p>
          )}
          <p className="hint">Pregunta: {String(payload.question ?? '')}</p>
          {respuestas && (
            <div className="grid2" style={{ alignItems: 'start' }}>
              {respuestas.map((r) => (
                <div key={r.proveedor} className="card">
                  <h4>{r.proveedor}{r.model ? ` · ${r.model}` : ''}</h4>
                  {r.error
                    ? <p style={{ color: 'var(--bad)' }}>{r.error}</p>
                    : <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}><TextoConCitas texto={r.answer ?? ''} /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
