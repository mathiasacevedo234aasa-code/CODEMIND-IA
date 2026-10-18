import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type EnvioIA } from '../lib/api';
import { Icon } from './Icon';

const TAREAS: [string, string][] = [
  ['documentar', 'Documentar'],
  ['asistente', 'Asistente'],
  ['traducir', 'Traducir'],
  ['revisar', 'Revisar documentación'],
];

/** Proveedor y modelo por tarea, límite de gasto, prompts propios e historial de envíos. */
export function IAAvanzado() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const proveedores = useStore((s) => s.proveedores);
  const [gasto, setGasto] = useState<{ usd: number; tokens: number; envios: number; sinPrecio: number } | null>(null);
  const [verEnvios, setVerEnvios] = useState(false);
  const [nuevoPrompt, setNuevoPrompt] = useState({ nombre: '', texto: '' });

  useEffect(() => { api.envios().then((r) => setGasto(r.gasto)).catch(() => {}); }, []);

  const porTarea = settings.modelosPorTarea ?? {};
  const prompts = settings.prompts ?? [];

  return (
    <>
      <div className="field">
        <label>Modelo por tarea</label>
        <p className="hint">Vacío = el proveedor y modelo generales. Útil para documentar con uno potente y preguntar con uno rápido.</p>
        {TAREAS.map(([id, nombre]) => (
          <div key={id} className="grid2" style={{ marginBottom: 4, alignItems: 'center' }}>
            <span className="hint">{nombre}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <select
                value={porTarea[id]?.proveedor ?? ''}
                onChange={(e) => void saveSettings({ modelosPorTarea: { ...porTarea, [id]: { proveedor: e.target.value, modelo: '' } } })}
              >
                <option value="">General</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {porTarea[id]?.proveedor && (
                <input
                  placeholder="modelo (vacío = el suyo)"
                  defaultValue={porTarea[id]?.modelo ?? ''}
                  onBlur={(e) => void saveSettings({ modelosPorTarea: { ...porTarea, [id]: { ...porTarea[id], modelo: e.target.value.trim() } } })}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="field">
        <label>Límite de gasto mensual (USD)</label>
        <input
          type="number" min={0} step={0.5} placeholder="Sin límite"
          value={settings.limiteGasto || ''}
          onChange={(e) => void saveSettings({ limiteGasto: Number(e.target.value) || 0 })}
        />
        {gasto && (
          <p className="hint">
            Este mes: {gasto.envios} envío(s), {gasto.tokens.toLocaleString()} tokens, {gasto.usd.toFixed(4)} USD
            {gasto.sinPrecio ? ` (más ${gasto.sinPrecio} envío(s) a modelos sin precio puesto, que no se pueden sumar)` : ''}.
            Al llegar al límite, no se envía nada más hasta que lo cambies.
          </p>
        )}
      </div>

      <div className="field">
        <label>Mis prompts</label>
        <p className="hint">Preguntas que repites a menudo. Aparecen en el asistente, en "Mis prompts".</p>
        {prompts.map((p, i) => (
          <div key={`${p.nombre}${i}`} className="stash-fila">
            <strong>{p.nombre}</strong>
            <span className="msg">{p.texto}</span>
            <button className="btn icon sm" title="Borrar" onClick={() => void saveSettings({ prompts: prompts.filter((_, j) => j !== i) })}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input placeholder="Nombre" style={{ maxWidth: 140 }} value={nuevoPrompt.nombre} onChange={(e) => setNuevoPrompt({ ...nuevoPrompt, nombre: e.target.value })} />
          <input placeholder="Texto del prompt" value={nuevoPrompt.texto} onChange={(e) => setNuevoPrompt({ ...nuevoPrompt, texto: e.target.value })} />
          <button
            className="btn sm outline"
            disabled={!nuevoPrompt.nombre.trim() || !nuevoPrompt.texto.trim()}
            onClick={() => { void saveSettings({ prompts: [...prompts, nuevoPrompt] }); setNuevoPrompt({ nombre: '', texto: '' }); }}
          >
            Añadir
          </button>
        </div>
      </div>

      <div className="field">
        <button className="btn outline" onClick={() => setVerEnvios(true)}>Historial de lo enviado a la IA</button>
        <p className="hint">Exactamente lo que salió hacia el proveedor (instrucciones, contexto y pregunta). Se guarda solo en este equipo.</p>
      </div>
      {verEnvios && <HistorialEnvios alCerrar={() => setVerEnvios(false)} />}
    </>
  );
}

function HistorialEnvios({ alCerrar }: { alCerrar: () => void }) {
  const [envios, setEnvios] = useState<EnvioIA[] | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  useEffect(() => { api.envios().then((r) => setEnvios(r.envios)).catch(() => setEnvios([])); }, []);
  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Lo enviado a la IA</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {!envios && <p className="hint"><span className="spinner" /> Cargando...</p>}
          {envios?.length === 0 && <p className="hint">Todavía no se ha enviado nada.</p>}
          {envios?.map((e, i) => (
            <div key={i} className="card" style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => setAbierto(abierto === i ? null : i)}>
                <Icon name={abierto === i ? 'chevronDown' : 'chevronRight'} size={12} />
                <span>{new Date(e.en).toLocaleString()}</span>
                <span className="tag muted">{e.proveedor} · {e.modelo}</span>
                <span className="hint">
                  {e.tokens.entrada + e.tokens.salida} tokens{e.tokens.estimado ? ' (estimados)' : ''}
                  {e.usd !== null ? ` · ${e.usd.toFixed(5)} USD` : ''}
                </span>
              </div>
              {abierto === i && (
                <>
                  {e.mensajes.map((m, j) => (
                    <div key={j} style={{ marginTop: 6 }}>
                      <span className="tag info">{m.role}</span>
                      <pre className="log-raw" style={{ maxHeight: 260 }}>{m.content}</pre>
                    </div>
                  ))}
                  <span className="tag ok">respuesta</span>
                  <pre className="log-raw" style={{ maxHeight: 260 }}>{e.respuesta}</pre>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button
            className="btn outline"
            onClick={() => { if (window.confirm('¿Borrar el historial de envíos? El gasto del mes se conserva.')) void api.borrarEnvios().then(() => setEnvios([])); }}
          >
            Borrar historial
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={alCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
