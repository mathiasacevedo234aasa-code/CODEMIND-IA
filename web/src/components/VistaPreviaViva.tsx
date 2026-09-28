import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { EstadoPreview } from '../lib/types';
import { Icon } from './Icon';

/**
 * Vista previa en vivo, con su propio servidor.
 *
 * Un iframe con el HTML metido dentro sirve para mirar una página suelta y se
 * queda corto en cuanto el proyecto es un proyecto: las rutas relativas no
 * resuelven igual, `fetch` no funciona y los módulos de JavaScript no cargan,
 * porque nada de eso existe sin un origen http de verdad.
 *
 * Esto levanta un servidor sobre tu carpeta, en `127.0.0.1` y en un puerto
 * suyo, y recarga la página sola al guardar. Es lo mismo que hace Live Server,
 * sin salir de aquí.
 */
export function VistaPreviaViva() {
  const project = useStore((s) => s.project);
  const openWebTab = useStore((s) => s.openWebTab);
  const log = useStore((s) => s.log);

  const [estado, setEstado] = useState<EstadoPreview | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!project) return;
    try {
      setEstado(await api.previewEstado(project.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [project]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Mientras está encendida se refresca el contador de peticiones: es la
  // forma de ver de un vistazo que la página está llegando de verdad.
  useEffect(() => {
    if (!estado?.activo) return;
    const id = window.setInterval(() => void cargar(), 3000);
    return () => window.clearInterval(id);
  }, [estado?.activo, cargar]);

  if (!project) return null;

  const arrancar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const res = await api.previewArrancar(project.id);
      setEstado({ ...res, activo: true });
      log('procesos', 'info', `Vista previa en ${res.url}${res.entrada ? ` (${res.entrada})` : ''}`);
      abrir(res.url, res.entrada);
      if (res.aviso) setError(res.aviso);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const detener = async () => {
    setOcupado(true);
    try {
      await api.previewDetener(project.id);
      setEstado({ activo: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const abrir = (url: string, entrada?: string | null) => {
    openWebTab(entrada ? `${url}/${entrada}` : url, `Vista previa · ${project.name}`);
  };

  return (
    <div className="card tarjeta-preview" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Vista previa en vivo</h4>
        <span style={{ flex: 1 }} />
        {estado?.activo ? (
          <>
            <span className="tag ok"><span className="status-dot ok" /> en marcha</span>
            <button className="btn sm outline" disabled={ocupado} onClick={() => void detener()}>Detener</button>
          </>
        ) : (
          <button className="btn sm primary" disabled={ocupado} onClick={() => void arrancar()}>
            {ocupado ? <span className="spinner" /> : <Icon name="play" size={12} />} Arrancar
          </button>
        )}
      </div>

      {estado?.activo ? (
        <>
          <div className="preview-url">
            <code>{estado.url}</code>
            {estado.entrada && <span className="meta">abre {estado.entrada}</span>}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn sm" onClick={() => abrir(estado.url!, estado.entrada)}>
              <Icon name="play" size={12} /> Abrir aquí
            </button>
            <button className="btn sm outline" onClick={() => window.open(estado.url, '_blank', 'noopener')}>
              <Icon name="link" size={12} /> En tu navegador
            </button>
            <button className="btn sm outline" onClick={() => void api.previewRecargar(project.id)}>
              <Icon name="refresh" size={12} /> Recargar
            </button>
          </div>

          <p className="hint" style={{ marginTop: 8 }}>
            {estado.peticiones ?? 0} petición(es) servidas. Se recarga sola al guardar cualquier archivo del
            proyecto. Solo escucha en <code>127.0.0.1</code>: nadie de tu red puede verla.
          </p>
        </>
      ) : (
        <p className="hint">
          Levanta un servidor de verdad sobre tu carpeta, como Live Server. A diferencia de la vista previa
          simple, aquí funcionan las rutas relativas, <code>fetch</code> y los módulos de JavaScript, porque
          hay un origen <code>http://</code> real.
        </p>
      )}

      {error && <div className="review-banner" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
