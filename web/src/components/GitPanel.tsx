import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { ChangeKind, GitBranches, GitChange, GitCommit, GitStatus } from '../lib/types';
import { Icon } from './Icon';
import { ask, validarNombreRama } from '../lib/dialogs';

const KIND_TAG: Record<ChangeKind, string> = {
  codigo: 'info',
  documentacion: 'ok',
  configuracion: 'warn',
  otro: 'muted',
};

const KIND_LABEL: Record<ChangeKind, string> = {
  codigo: 'código',
  documentacion: 'doc.',
  configuracion: 'config.',
  otro: 'otro',
};

/** Fecha relativa legible, sin traer una librería entera para esto. */
function hace(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'hace instantes';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(months / 12)} año(s)`;
}

function DiffView({ diff, binary }: { diff: string; binary: boolean }) {
  if (binary) return <p className="hint">Archivo binario: no se puede mostrar una comparación de texto.</p>;
  if (!diff.trim()) return <p className="hint">Sin diferencias que mostrar.</p>;
  return (
    <pre className="diff">
      {diff.split('\n').map((line, i) => {
        const color = line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')
          ? 'var(--text-faint)'
          : line.startsWith('@@')
            ? 'var(--accent)'
            : line.startsWith('+')
              ? 'var(--ok)'
              : line.startsWith('-')
                ? 'var(--danger)'
                : 'var(--text-dim)';
        return <div key={i} style={{ color }}>{line || ' '}</div>;
      })}
    </pre>
  );
}

function Section({
  title, items, tone, actionLabel, onAction, onActionAll, onSelect, selected, onOpen,
}: {
  title: string;
  items: GitChange[];
  tone?: 'danger';
  actionLabel: string;
  onAction: (path: string) => void;
  onActionAll: () => void;
  onSelect: (change: GitChange) => void;
  selected: string | null;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;

  return (
    <div className="git-section">
      <div className="git-section-head" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        <span style={{ color: tone === 'danger' ? 'var(--danger)' : undefined }}>{title}</span>
        <span className="tag muted">{items.length}</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn sm outline"
          onClick={(e) => { e.stopPropagation(); onActionAll(); }}
          title={`${actionLabel} todos`}
        >
          {actionLabel} todos
        </button>
      </div>
      {open && items.map((item) => (
        <div
          key={`${item.code}-${item.path}`}
          className={`git-row ${selected === item.path ? 'selected' : ''}`}
          onClick={() => onSelect(item)}
        >
          <span className={`tag ${KIND_TAG[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
          <span className="git-path" title={item.path}>
            <span className="dir">{item.path.includes('/') ? `${item.path.slice(0, item.path.lastIndexOf('/'))}/` : ''}</span>
            <span className="file">{item.path.split('/').pop()}</span>
          </span>
          <span className="git-label">{item.label}</span>
          <span className="git-actions">
            <button className="btn icon sm" title="Abrir en el editor" onClick={(e) => { e.stopPropagation(); onOpen(item.path); }}>
              <Icon name="file" size={12} />
            </button>
            <button className="btn icon sm" title={actionLabel} onClick={(e) => { e.stopPropagation(); onAction(item.path); }}>
              <Icon name={actionLabel === 'Preparar' ? 'plus' : 'close'} size={12} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function GitPanel() {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);
  const openFile = useStore((s) => s.openFile);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selected, setSelected] = useState<GitChange | null>(null);
  const [diff, setDiff] = useState<{ diff: string; binary: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const st = await api.gitStatus(project.id);
      if (!alive.current) return;
      setStatus(st);
      if (st.isRepo) {
        const [br, lg] = await Promise.all([
          api.gitBranches(project.id).catch(() => null),
          api.gitLog(project.id, 25).catch(() => ({ commits: [] })),
        ]);
        if (!alive.current) return;
        if (br) setBranches(br);
        setCommits(lg.commits);
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    }
  }, [project, setError]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const selectChange = async (change: GitChange, staged: boolean) => {
    if (!project) return;
    setSelected(change);
    setDiff(null);
    try {
      setDiff(await api.gitDiff(project.id, change.path, staged));
    } catch (err) {
      setDiff({ diff: `No se pudo obtener la comparación: ${(err as Error).message}`, binary: false });
    }
  };

  const guard = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (err) {
      const text = (err as Error).message;
      setNotice(text);
      log('git', 'error', text);
    } finally {
      setBusy(false);
    }
  };

  if (!project) return null;

  if (status && !status.available) {
    return (
      <div className="empty">
        <Icon name="git" size={22} />
        <h3>Git no está disponible</h3>
        <p>{status.message ?? 'No se encontró el ejecutable de git en este equipo.'}</p>
        <p className="hint">Instala Git y vuelve a abrir el proyecto para usar el control de versiones.</p>
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div className="empty">
        <Icon name="git" size={22} />
        <h3>Sin control de versiones</h3>
        <p>Esta carpeta todavía no es un repositorio de git.</p>
        <button className="btn primary" disabled={busy} onClick={() => void guard(() => api.gitInit(project.id))}>
          <Icon name="plus" size={13} /> Inicializar repositorio
        </button>
        <p className="hint">Se creará una carpeta <code>.git</code> dentro del proyecto. Ningún archivo tuyo se modifica.</p>
      </div>
    );
  }

  if (!status) return <p className="hint" style={{ padding: 12 }}>Consultando el estado del repositorio...</p>;

  const staged = status.staged.map((c) => c.path);
  const commitSummary = status.staged.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="git-panel">
      <div className="git-head">
        <Icon name="git" size={14} />
        <select
          value={status.branch ?? ''}
          disabled={busy || status.detached}
          onChange={(e) => void guard(() => api.gitCheckout(project.id, e.target.value))}
          title="Cambiar de rama"
        >
          {status.detached && <option value="">(cabeza separada)</option>}
          {(branches?.local ?? (status.branch ? [status.branch] : [])).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <button
          className="btn icon sm"
          title="Crear una rama nueva"
          disabled={busy}
          onClick={() => void (async () => {
            const name = await ask({
              title: 'Nueva rama',
              label: `Se creará a partir de ${status.branch ?? 'la rama actual'}`,
              placeholder: 'arreglo/carrito',
              confirmText: 'Crear rama',
              validate: validarNombreRama,
            });
            if (name) void guard(() => api.gitCheckout(project.id, name, true));
          })()}
        >
          <Icon name="plus" size={13} />
        </button>
        <span style={{ flex: 1 }} />
        {status.ahead > 0 && <span className="tag info">{status.ahead} por subir</span>}
        {status.behind > 0 && <span className="tag warn">{status.behind} por traer</span>}
        <button className="btn icon sm" title="Recargar" disabled={busy} onClick={() => void load()}>
          {busy ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
        </button>
      </div>

      {status.upstream && <p className="hint" style={{ padding: '0 10px 6px' }}>Rama remota: {status.upstream}</p>}

      {notice && (
        <div className="review-banner" style={{ margin: '0 10px 8px', borderColor: 'var(--warn)' }}>
          {notice}
        </div>
      )}

      <div className="panel-body">
        {status.clean && (
          <p className="hint" style={{ padding: 12 }}>No hay cambios pendientes. El árbol de trabajo está limpio.</p>
        )}

        <Section
          title="Conflictos" items={status.conflicts} tone="danger" actionLabel="Preparar"
          onAction={(p) => void guard(() => api.gitStage(project.id, [p]))}
          onActionAll={() => void guard(() => api.gitStage(project.id, status.conflicts.map((c) => c.path)))}
          onSelect={(c) => void selectChange(c, false)} selected={selected?.path ?? null} onOpen={(p) => void openFile(p)}
        />
        <Section
          title="Cambios preparados" items={status.staged} actionLabel="Quitar"
          onAction={(p) => void guard(() => api.gitUnstage(project.id, [p]))}
          onActionAll={() => void guard(() => api.gitUnstage(project.id, staged))}
          onSelect={(c) => void selectChange(c, true)} selected={selected?.path ?? null} onOpen={(p) => void openFile(p)}
        />
        <Section
          title="Cambios sin preparar" items={status.unstaged} actionLabel="Preparar"
          onAction={(p) => void guard(() => api.gitStage(project.id, [p]))}
          onActionAll={() => void guard(() => api.gitStage(project.id, status.unstaged.map((c) => c.path)))}
          onSelect={(c) => void selectChange(c, false)} selected={selected?.path ?? null} onOpen={(p) => void openFile(p)}
        />
        <Section
          title="Sin seguimiento" items={status.untracked} actionLabel="Preparar"
          onAction={(p) => void guard(() => api.gitStage(project.id, [p]))}
          onActionAll={() => void guard(() => api.gitStage(project.id, status.untracked.map((c) => c.path)))}
          onSelect={(c) => void selectChange(c, false)} selected={selected?.path ?? null} onOpen={(p) => void openFile(p)}
        />

        {selected && diff && (
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="panel-title">Comparación</span>
              <span className="tag muted">{selected.path}</span>
              <span style={{ flex: 1 }} />
              <button className="btn icon sm" onClick={() => { setSelected(null); setDiff(null); }}>
                <Icon name="close" size={12} />
              </button>
            </div>
            <DiffView diff={diff.diff} binary={diff.binary} />
          </div>
        )}

        <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
          <span className="panel-title">Confirmar cambios</span>
          {status.staged.length > 0 ? (
            <p className="hint" style={{ margin: '6px 0' }}>
              Entrarán {status.staged.length} archivo(s):{' '}
              {Object.entries(commitSummary).map(([kind, n]) => `${n} de ${KIND_LABEL[kind as ChangeKind]}`).join(', ')}.
            </p>
          ) : (
            <p className="hint" style={{ margin: '6px 0' }}>Prepara primero los archivos que quieras incluir.</p>
          )}
          <textarea
            placeholder="Mensaje del commit"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ minHeight: 56 }}
          />
          <button
            className="btn primary"
            style={{ marginTop: 6 }}
            disabled={busy || !status.staged.length || !message.trim()}
            onClick={() =>
              void guard(async () => {
                const { commit } = await api.gitCommit(project.id, message.trim());
                log('git', 'info', `Commit ${commit.short}: ${commit.subject}`);
                setMessage('');
              })
            }
          >
            <Icon name="check" size={13} /> Crear commit
          </button>
        </div>

        {commits.length > 0 && (
          <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
            <span className="panel-title">Historial</span>
            {commits.map((c) => (
              <div key={c.hash} className="commit-row" title={c.body || c.subject}>
                <code>{c.short}</code>
                <span className="commit-subject">{c.subject}</span>
                <span className="commit-meta">{c.author} · {hace(c.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
