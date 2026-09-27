import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { PlanEjecucion } from '../lib/types';
import { Icon } from './Icon';

/**
 * Ejecutar el archivo que tienes delante.
 *
 * Un `.py` abierto y un botón: eso es todo lo que debería hacer falta. El
 * comando se escribe en el **Terminal**, no en un proceso aparte, porque un
 * programa que hace `input()` se quedaría colgado para siempre sin una
 * consola de verdad. Además así ves el comando escrito, que es la mejor forma
 * de aprender cuál era.
 *
 * Antes de ofrecer el botón se comprueba que la herramienta está instalada.
 * Un botón que falla con «comando no encontrado» es peor que no tenerlo.
 */
export function useplanDelArchivo(): { plan: PlanEjecucion | null; ruta: string | null } {
  const project = useStore((s) => s.project);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  const activa = tabs.find((t) => t.id === activeTabId);
  const ruta = activa?.kind === 'file' ? activa.path : null;

  const [plan, setPlan] = useState<PlanEjecucion | null>(null);

  useEffect(() => {
    if (!project || !ruta) { setPlan(null); return; }
    let vigente = true;
    api.planEjecucion(project.id, ruta)
      .then((p) => { if (vigente) setPlan(p); })
      .catch(() => { if (vigente) setPlan(null); });
    return () => { vigente = false; };
  }, [project, ruta]);

  return { plan, ruta };
}

/** El botón de la barra de pestañas. Solo aparece si el archivo se puede ejecutar. */
export function BotonEjecutarArchivo() {
  const project = useStore((s) => s.project);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const saveFile = useStore((s) => s.saveFile);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);
  const { plan, ruta } = useplanDelArchivo();

  const [lanzando, setLanzando] = useState(false);

  if (!project || !ruta || !plan?.soportado) return null;

  const ejecutar = async () => {
    setLanzando(true);
    try {
      // Se guarda antes: ejecutar una versión vieja del archivo que tienes
      // delante sería desconcertante.
      await saveFile(ruta);
      const res = await api.ejecutarArchivo(project.id, ruta);
      setBottomTab('terminal');
      log('procesos', 'info', `Ejecutando ${res.plan.nombre ?? ruta}: ${res.plan.comando}`);
    } catch (err) {
      setError((err as Error).message);
      setBottomTab('terminal');
    } finally {
      setLanzando(false);
    }
  };

  const titulo = plan.disponible
    ? `Ejecutar con ${plan.lenguaje}${plan.version ? ` ${plan.version}` : ''} — ${plan.comando}`
    : plan.motivo ?? 'No se puede ejecutar';

  return (
    <button
      className={`btn icon sm ${plan.disponible ? 'ejecutar-listo' : ''}`}
      title={titulo}
      disabled={lanzando || !plan.disponible}
      onClick={() => void ejecutar()}
    >
      {lanzando ? <span className="spinner" /> : <Icon name="play" size={13} />}
    </button>
  );
}

/** La tarjeta del panel Ejecutar, con el detalle y el motivo cuando no se puede. */
export function TarjetaEjecutarArchivo() {
  const project = useStore((s) => s.project);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const saveFile = useStore((s) => s.saveFile);
  const setError = useStore((s) => s.setError);
  const { plan, ruta } = useplanDelArchivo();
  const [lanzando, setLanzando] = useState(false);

  if (!project) return null;

  const ejecutar = async () => {
    if (!ruta) return;
    setLanzando(true);
    try {
      await saveFile(ruta);
      await api.ejecutarArchivo(project.id, ruta);
      setBottomTab('terminal');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLanzando(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h4>Ejecutar el archivo abierto</h4>

      {!ruta && <p className="hint">Abre un archivo para poder ejecutarlo.</p>}

      {ruta && !plan && <p className="hint">Mirando qué hace falta para ejecutar <code>{ruta}</code>...</p>}

      {ruta && plan && !plan.soportado && (
        <p className="hint"><Icon name="warn" size={12} /> {plan.motivo}</p>
      )}

      {ruta && plan?.soportado && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className={`tag ${plan.disponible ? 'ok' : 'warn'}`}>{plan.lenguaje}</span>
            {plan.version && <span className="meta">{plan.herramienta} {plan.version}</span>}
            <span style={{ flex: 1 }} />
            <button className="btn sm primary" disabled={!plan.disponible || lanzando} onClick={() => void ejecutar()}>
              {lanzando ? <span className="spinner" /> : <Icon name="play" size={12} />} Ejecutar
            </button>
          </div>

          <pre className="log-raw" style={{ maxHeight: 90, marginTop: 8 }}>{plan.comando}</pre>

          {plan.nota && <p className="hint">{plan.nota}</p>}
          {!plan.disponible && (
            <div className="review-banner" style={{ marginTop: 6 }}>
              {plan.motivo}
            </div>
          )}
          <p className="hint">
            Se ejecuta en el <strong>Terminal</strong>, con tus permisos. Por eso funcionan los programas
            que piden datos por teclado, y puedes pararlos con Ctrl+C.
          </p>
        </>
      )}
    </div>
  );
}
