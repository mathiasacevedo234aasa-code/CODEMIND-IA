import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { CheckIssue, CheckResult, ChecksInfo } from '../lib/types';
import { Icon } from './Icon';

/**
 * Comprobaciones del proyecto: pruebas, tipos y estilo.
 *
 * Aquí no hay un analizador propio compitiendo con el del proyecto: se
 * ejecutan las herramientas que el propio package.json declara y se traduce
 * su salida a una lista en la que se puede pulsar para ir a la línea exacta.
 *
 * CodeMind AI enseña lo que dice la herramienta. No corrige nada.
 */
export function ChecksPanel() {
  const project = useStore((s) => s.project);
  const openFile = useStore((s) => s.openFile);
  const jumpToLine = useStore((s) => s.jumpToLine);
  const log = useStore((s) => s.log);

  const [info, setInfo] = useState<ChecksInfo | null>(null);
  const [resultados, setResultados] = useState<Record<string, CheckResult>>({});
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [salidaAbierta, setSalidaAbierta] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setInfo(null);
    setResultados({});
    api.checks(project.id).then(setInfo).catch((err: Error) => setError(err.message));
  }, [project]);

  const ejecutar = async (script: string) => {
    if (!project) return;
    setCorriendo(script);
    setError(null);
    log('procesos', 'info', `Ejecutando la comprobación "${script}"...`);
    try {
      const res = await api.runCheck(project.id, script);
      setResultados((previo) => ({ ...previo, [script]: res }));
      const nivel = res.correcto ? 'info' : 'error';
      log('errores', nivel, `${res.comando}: ${res.correcto ? 'sin problemas' : `${res.avisos.length} aviso(s)`}`);
      for (const a of res.avisos) {
        log('errores', a.nivel === 'error' ? 'error' : 'warn', `${a.archivo}:${a.linea} ${a.mensaje}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCorriendo(null);
    }
  };

  const irA = async (aviso: CheckIssue) => {
    await openFile(aviso.archivo);
    jumpToLine(aviso.archivo, aviso.linea);
  };

  if (!project) return <p className="hint" style={{ padding: 12 }}>Abre un proyecto para comprobarlo.</p>;

  return (
    <div className="panel-body" style={{ padding: 12 }}>
      {error && <div className="review-banner" style={{ borderColor: 'var(--bad)', marginBottom: 10 }}>{error}</div>}

      {!info && !error && <p className="hint">Buscando las comprobaciones que declara el proyecto...</p>}

      {info?.notas.map((n) => (
        <p className="hint" key={n} style={{ marginBottom: 8 }}><Icon name="warn" size={12} /> {n}</p>
      ))}

      {info?.tareas.map((tarea) => {
        const res = resultados[tarea.id];
        const activa = corriendo === tarea.id;
        return (
          <div className="card" key={tarea.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ margin: 0 }}>{tarea.etiqueta}</h4>
              <code style={{ fontSize: 11 }}>{tarea.comando}</code>
              <span style={{ flex: 1 }} />
              {res && (
                <span className={`tag ${res.correcto ? 'ok' : 'warn'}`}>
                  {res.correcto ? 'Sin problemas' : `${res.avisos.length} aviso(s)`}
                </span>
              )}
              <button className="btn sm primary" disabled={activa} onClick={() => void ejecutar(tarea.id)}>
                {activa ? <span className="spinner" /> : <Icon name="play" size={12} />}
                {activa ? 'Ejecutando...' : res ? 'Repetir' : 'Ejecutar'}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>{tarea.descripcion}</p>

            {res && (
              <>
                <p className="meta" style={{ marginTop: 6 }}>
                  {res.comando} · código {res.exitCode ?? 'sin código'} · {(res.ms / 1000).toFixed(1)} s
                  {res.resumen && ` · ${res.resumen.superadas} superada(s), ${res.resumen.fallidas} fallida(s)`}
                  {res.cortada && ' · se cortó por tardar demasiado'}
                </p>

                {res.error && <div className="review-banner" style={{ borderColor: 'var(--bad)' }}>{res.error}</div>}

                {res.sinLeer && (
                  <div className="review-banner" style={{ marginTop: 6 }}>
                    La comprobación falló, pero su salida no tiene un formato que CodeMind AI sepa situar en
                    archivos y líneas. Léela entera aquí abajo: no se ha interpretado nada por ti.
                  </div>
                )}

                {res.avisos.map((a, i) => (
                  <div key={`${a.archivo}${a.linea}${i}`} className="mapa-fila" onClick={() => void irA(a)}>
                    <span className={`tag ${a.nivel === 'error' ? 'warn' : 'muted'}`}>{a.nivel}</span>
                    <code>{a.archivo}:{a.linea}</code>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.mensaje}</span>
                    {a.regla && <span className="tag muted">{a.regla}</span>}
                  </div>
                ))}

                <button
                  className="btn sm outline"
                  style={{ marginTop: 6 }}
                  onClick={() => setSalidaAbierta(salidaAbierta === tarea.id ? null : tarea.id)}
                >
                  {salidaAbierta === tarea.id ? 'Ocultar la salida completa' : 'Ver la salida completa'}
                </button>
                {salidaAbierta === tarea.id && <pre className="log-raw">{res.salida || '(sin salida)'}</pre>}
              </>
            )}
          </div>
        );
      })}

      {info && info.tareas.length > 0 && (
        <p className="hint">
          <Icon name="warn" size={12} /> Se ejecutan tal cual los scripts de tu package.json, con tus propias
          reglas. CodeMind AI solo te enseña el resultado y te lleva a la línea; no cambia tu código.
        </p>
      )}
    </div>
  );
}
