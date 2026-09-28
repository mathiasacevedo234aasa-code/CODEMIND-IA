import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { RunLogLine, RunProcess, RunScriptsInfo } from '../lib/types';
import { Icon } from './Icon';
import { TarjetaEjecutarArchivo } from './EjecutarArchivo';
import { LenguajesInstalados } from './LenguajesInstalados';
import { VistaPreviaViva } from './VistaPreviaViva';

const STATUS_DOT: Record<RunProcess['status'], string> = {
  iniciando: 'warn',
  activo: 'ok',
  terminado: '',
  error: 'err',
};

function transcurrido(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ProcessCard({ process, onStop }: { process: RunProcess; onStop: () => void }) {
  const projectId = useStore((s) => s.project?.id);
  const openWebTab = useStore((s) => s.openWebTab);
  const log = useStore((s) => s.log);

  const [lines, setLines] = useState<RunLogLine[]>([]);
  const [open, setOpen] = useState(true);
  const [current, setCurrent] = useState(process);

  const sinceRef = useRef(0);
  const boxRef = useRef<HTMLPreElement | null>(null);
  const reportedError = useRef(false);

  useEffect(() => setCurrent(process), [process]);

  const active = current.status === 'iniciando' || current.status === 'activo';

  useEffect(() => {
    if (!projectId || !active) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.runLogs(projectId, current.id, sinceRef.current);
        if (cancelled) return;
        if (res.lines.length) {
          sinceRef.current = res.lines[res.lines.length - 1].seq;
          // Solo seguimos el final si el usuario ya estaba abajo; si subió a
          // leer algo, no se le mueve la vista.
          const box = boxRef.current;
          const pegadoAbajo = !box || box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
          setLines((prev) => [...prev, ...res.lines].slice(-500));
          if (pegadoAbajo) {
            requestAnimationFrame(() => {
              if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
            });
          }
        }
        setCurrent(res.process);
        if (res.process.status === 'error' && !reportedError.current) {
          reportedError.current = true;
          const last = [...res.lines].reverse().find((l) => l.stream === 'stderr');
          log('procesos', 'error', `${res.process.label} terminó con error. ${last?.text ?? ''}`);
        }
      } catch {
        /* el proceso puede haber desaparecido: el siguiente refresco lo refleja */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, current.id, active, log]);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`status-dot ${STATUS_DOT[current.status]}`} />
        <strong style={{ fontSize: 13 }}>{current.label}</strong>
        <span className="tag muted">{current.status}</span>
        <span style={{ flex: 1 }} />
        <span className="hint">{transcurrido(current.startedAt)}</span>
        {active && (
          <button
            className="btn sm danger"
            onClick={() => { if (window.confirm(`¿Detener "${current.label}"?`)) onStop(); }}
          >
            Detener
          </button>
        )}
        <button className="btn icon sm" onClick={() => setOpen((v) => !v)} title={open ? 'Plegar registro' : 'Ver registro'}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        </button>
      </div>

      <p className="meta" style={{ fontFamily: 'var(--mono)', marginTop: 4 }}>{current.command}</p>

      {current.url && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="tag ok">{current.url}</span>
          <button className="btn sm primary" onClick={() => openWebTab(current.url!, current.label)}>
            <Icon name="play" size={12} /> Abrir aquí
          </button>
          <button className="btn sm outline" onClick={() => window.open(current.url!, '_blank', 'noreferrer')}>
            Abrir en el navegador
          </button>
        </div>
      )}

      {open && (
        <pre ref={boxRef} className="run-log">
          {lines.length === 0 && <div style={{ color: 'var(--text-faint)' }}>Sin salida todavía...</div>}
          {lines.map((l) => (
            <div
              key={l.seq}
              style={{ color: l.stream === 'stderr' ? 'var(--warn)' : l.stream === 'sistema' ? 'var(--text-faint)' : undefined }}
            >
              {l.text || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export function RunPanel() {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);

  const [info, setInfo] = useState<RunScriptsInfo | null>(null);
  const [processes, setProcesses] = useState<RunProcess[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const [scripts, procs] = await Promise.all([
        api.runScripts(project.id),
        api.runProcesses(project.id),
      ]);
      setInfo(scripts);
      setProcesses(procs.processes);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [project, setError]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const start = async (payload: { script?: string; command?: string; label?: string }) => {
    if (!project) return;
    setBusy(true);
    try {
      const res = await api.runStart(project.id, payload);
      log('procesos', 'info', `Iniciado: ${res.process.command}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
      log('procesos', 'error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!project || !info) return <p className="hint" style={{ padding: 12 }}>Consultando el proyecto...</p>;

  const activeCommands = new Set(
    processes.filter((p) => p.status === 'iniciando' || p.status === 'activo').map((p) => p.command),
  );

  return (
    <div className="panel-body" style={{ padding: 12 }}>
      <VistaPreviaViva />
      <TarjetaEjecutarArchivo />
      <LenguajesInstalados />

      {!info.hasPackageJson ? (
        <div className="empty" style={{ height: 'auto', paddingTop: 24 }}>
          <Icon name="terminal" size={22} />
          <h3>Sin scripts declarados</h3>
          <p>Este proyecto no tiene <code>package.json</code>, así que no declara ningún servidor de desarrollo.</p>
          <p className="hint">
            La vista previa del panel inferior ejecuta HTML, CSS y JavaScript de navegador sin necesidad de nada más.
            Para React, Vue, Angular, Svelte o TypeScript hace falta un <code>package.json</code> con su propio servidor
            de desarrollo: entonces aparecerá aquí y podrás arrancarlo.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {info.framework && <span className="tag info">{info.framework}</span>}
            <span className="tag muted">{info.packageManager}</span>
            <span className={`tag ${info.hasNodeModules ? 'ok' : 'warn'}`}>
              {info.hasNodeModules ? 'dependencias instaladas' : 'sin dependencias'}
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn icon sm" onClick={() => void load()} title="Actualizar"><Icon name="refresh" size={13} /></button>
          </div>

          {info.notes.map((note, i) => (
            <div key={i} className="review-banner" style={{ marginBottom: 8 }}>{note}</div>
          ))}

          {!info.hasNodeModules && (
            <button
              className="btn primary"
              style={{ marginBottom: 12 }}
              disabled={busy}
              onClick={() => void start({ command: 'install', label: 'Instalar dependencias' })}
            >
              {busy ? <span className="spinner" /> : <Icon name="plus" size={13} />} Instalar dependencias
            </button>
          )}

          <span className="panel-title">Scripts del proyecto</span>
          {info.scripts.length === 0 && <p className="hint">El package.json no declara ningún script.</p>}
          {info.scripts.map((s) => {
            const running = activeCommands.has(`${info.packageManager} run ${s.name}`);
            return (
              <div key={s.name} className="script-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 12.5 }}>{s.name}</strong>
                  <div className="hint" style={{ fontFamily: 'var(--mono)' }}>{s.command}</div>
                </div>
                <button
                  className="btn sm primary"
                  disabled={busy || running}
                  title={running ? 'Ya se está ejecutando' : `Ejecutar ${s.name}`}
                  onClick={() => void start({ script: s.name })}
                >
                  <Icon name="play" size={12} /> {running ? 'En marcha' : 'Ejecutar'}
                </button>
              </div>
            );
          })}
        </>
      )}

      {processes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span className="panel-title">Procesos</span>
          {processes.map((p) => (
            <ProcessCard
              key={p.id}
              process={p}
              onStop={() =>
                void (async () => {
                  try {
                    await api.runStop(project.id, p.id);
                    log('procesos', 'info', `Detenido: ${p.label}`);
                    await load();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                })()
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
