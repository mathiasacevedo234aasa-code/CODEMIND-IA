import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { UrlProbe } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  url: string;
  title: string;
  onUrlChange: (url: string) => void;
}

const normalize = (value: string) => (/^https?:\/\//i.test(value) ? value : `http://${value}`);

/**
 * Navegador integrado: muestra el servidor de desarrollo del usuario, o
 * cualquier página, dentro de una pestaña del área central.
 */
export function WebView({ url, title, onUrlChange }: Props) {
  const [draft, setDraft] = useState(url);
  const [probe, setProbe] = useState<UrlProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // El iframe es de otro origen, así que su historial no se puede leer:
  // mantenemos el nuestro.
  const history = useRef<string[]>([url]);
  const cursor = useRef(0);
  const retries = useRef(0);
  const retryTimer = useRef<number | null>(null);

  useEffect(() => setDraft(url), [url]);

  const check = useCallback(async (target: string) => {
    try {
      const result = await api.probeUrl(target);
      setProbe(result);
      if (!result.reachable && /localhost|127\.0\.0\.1/.test(target) && retries.current < 5) {
        retries.current += 1;
        retryTimer.current = window.setTimeout(() => void check(target), 3000);
      }
    } catch (err) {
      setProbe({ url: target, reachable: false, status: null, embeddable: false, reason: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    retries.current = 0;
    setLoading(true);
    void check(url);
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [url, check]);

  const go = (target: string) => {
    const clean = normalize(target.trim());
    if (!clean || clean === url) return;
    history.current = [...history.current.slice(0, cursor.current + 1), clean];
    cursor.current = history.current.length - 1;
    onUrlChange(clean);
  };

  const move = (delta: number) => {
    const next = cursor.current + delta;
    if (next < 0 || next >= history.current.length) return;
    cursor.current = next;
    onUrlChange(history.current[next]);
  };

  return (
    <div className="webview">
      <div className="webview-bar">
        <button className="btn icon sm" disabled={cursor.current === 0} onClick={() => move(-1)} title="Atrás">
          <Icon name="chevronRight" size={13} />
        </button>
        <button
          className="btn icon sm"
          disabled={cursor.current >= history.current.length - 1}
          onClick={() => move(1)}
          title="Adelante"
        >
          <Icon name="chevronRight" size={13} />
        </button>
        <button
          className="btn icon sm"
          title="Recargar"
          onClick={() => { retries.current = 0; setLoading(true); setReloadKey((k) => k + 1); void check(url); }}
        >
          <Icon name="refresh" size={13} />
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(draft); }}
          spellCheck={false}
          style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
        />
        <button className="btn icon sm" title="Abrir en el navegador del sistema" onClick={() => window.open(url, '_blank', 'noreferrer')}>
          <Icon name="link" size={13} />
        </button>
      </div>

      {probe && !probe.reachable ? (
        <div className="empty">
          <Icon name="warn" size={22} />
          <h3>No se pudo cargar {title}</h3>
          <p>{probe.reason}</p>
          {retries.current > 0 && retries.current < 5 && (
            <p className="hint">Reintentando automáticamente ({retries.current} de 5)...</p>
          )}
          <button className="btn primary" onClick={() => { retries.current = 0; void check(url); setReloadKey((k) => k + 1); }}>
            <Icon name="refresh" size={13} /> Reintentar
          </button>
        </div>
      ) : (
        <>
          {probe && !probe.embeddable && (
            <div className="review-banner" style={{ margin: 8, borderColor: 'var(--warn)' }}>
              {probe.reason} La única forma de verlo es abrirlo en el navegador del sistema.
              <div style={{ marginTop: 6 }}>
                <button className="btn sm outline" onClick={() => window.open(url, '_blank', 'noreferrer')}>
                  Abrir en el navegador
                </button>
              </div>
            </div>
          )}
          {loading && <div className="webview-loading"><span className="spinner" /> Cargando...</div>}
          <iframe
            key={`${url}-${reloadKey}`}
            title={title}
            src={url}
            onLoad={() => setLoading(false)}
            // Aquí sí se permite allow-same-origin: es el servidor de desarrollo
            // del propio usuario y necesita su almacenamiento para funcionar.
            // La vista previa de HTML suelto del panel inferior se ejecuta sin
            // ese permiso, porque allí el código no tiene por qué ser de fiar.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            className="webview-frame"
          />
        </>
      )}
    </div>
  );
}
