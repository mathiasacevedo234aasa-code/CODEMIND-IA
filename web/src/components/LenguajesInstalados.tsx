import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LenguajeDisponible } from '../lib/types';
import { Icon } from './Icon';

/**
 * Qué lenguajes puede ejecutar este equipo.
 *
 * No es una lista de lo que CodeMind AI soporta: es lo que **tú** tienes
 * instalado ahora mismo, preguntándoselo a cada herramienta. Lo que falta se
 * dice con el sitio del que se descarga, para que la respuesta a «¿por qué no
 * puedo ejecutar mi .rb?» esté aquí y no en una búsqueda.
 */
export function LenguajesInstalados() {
  const [lista, setLista] = useState<LenguajeDisponible[] | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async (refrescar = false) => {
    setComprobando(true);
    setError(null);
    try {
      const res = await api.lenguajes(refrescar);
      setLista(res.lenguajes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setComprobando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const listos = lista?.filter((l) => l.disponible) ?? [];
  const faltan = lista?.filter((l) => !l.disponible) ?? [];
  const visibles = verTodos ? [...listos, ...faltan] : listos;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Lenguajes que puede ejecutar este equipo</h4>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" disabled={comprobando} onClick={() => void cargar(true)}>
          {comprobando ? <span className="spinner" /> : <Icon name="refresh" size={12} />} Volver a comprobar
        </button>
      </div>

      {error && <p className="hint" style={{ color: 'var(--bad)' }}>{error}</p>}
      {!lista && !error && <p className="hint">Preguntándole a cada herramienta por su versión...</p>}

      {lista && (
        <>
          <div className="lenguajes-rejilla">
            {visibles.map((l) => (
              <div key={l.lenguaje} className={`lenguaje-fila ${l.disponible ? '' : 'falta'}`}>
                <span className={`status-dot ${l.disponible ? 'ok' : 'warn'}`} />
                <strong>{l.lenguaje}</strong>
                {l.disponible
                  ? <span className="meta">{l.version}</span>
                  : <span className="meta">falta {l.herramienta}</span>}
                {!l.disponible && l.donde && <span className="meta">· {l.donde}</span>}
                {l.aviso && <span className="tag warn" title={l.aviso}>versión insuficiente</span>}
              </div>
            ))}
          </div>

          {faltan.length > 0 && (
            <button className="btn sm outline" style={{ marginTop: 8 }} onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Ver solo los que puedo usar' : `Ver los ${faltan.length} que faltan`}
            </button>
          )}

          <p className="hint" style={{ marginTop: 8 }}>
            Se le pregunta la versión a cada herramienta de verdad. Si instalas alguna ahora, pulsa
            «Volver a comprobar»: no hace falta reiniciar nada.
          </p>
        </>
      )}
    </div>
  );
}
