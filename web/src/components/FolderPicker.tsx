import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { DiskListing, DiskProbe, DiskRoot } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (path: string, suggestedName: string) => void;
  title?: string;
}

/** Diálogo para navegar por el disco real y elegir una carpeta de trabajo. */
export function FolderPicker({ open, onClose, onChoose, title = 'Abrir una carpeta' }: Props) {
  const [roots, setRoots] = useState<DiskRoot[]>([]);
  const [listing, setListing] = useState<DiskListing | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [probe, setProbe] = useState<(DiskProbe & { safe?: boolean; unsafeReason?: string | null }) | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const navigate = useCallback(async (target: string) => {
    setLoading(true);
    setProblem(null);
    try {
      const res = await api.diskList(target, showHidden);
      setListing(res);
      setPathInput(res.path);
      setSelected(null);
    } catch (err) {
      // Un error de navegación no debe cerrar el diálogo ni sacar al usuario.
      setProblem((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    if (!open) return;
    setProblem(null);
    api.diskRoots()
      .then(({ roots: r }) => {
        setRoots(r);
        const start = r.find((x) => x.label === 'Escritorio') ?? r.find((x) => x.kind === 'carpeta') ?? r[0];
        if (start) void navigate(start.path);
      })
      .catch((err: Error) => setProblem(err.message));
    requestAnimationFrame(() => inputRef.current?.focus());
    // Solo al abrir: navigate cambia con showHidden y no queremos reiniciar la ruta.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && listing) void navigate(listing.path);
  }, [showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // El sondeo se retrasa para no lanzar una petición por cada pulsación.
  useEffect(() => {
    const target = selected ?? listing?.path;
    if (!open || !target) return;
    const timer = window.setTimeout(() => {
      api.diskProbe(target).then(setProbe).catch(() => setProbe(null));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selected, listing?.path, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirs = (listing?.entries ?? []).filter((e) => e.type === 'dir');
  const files = (listing?.entries ?? []).filter((e) => e.type === 'file');
  const target = selected ?? listing?.path ?? '';
  const unsafe = probe && probe.safe === false;
  const canChoose = Boolean(target) && !loading && Boolean(probe?.isDir) && Boolean(probe?.writable) && !unsafe;

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (!dirs.length) return;
    const index = dirs.findIndex((d) => d.path === selected);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(dirs[Math.min(dirs.length - 1, index + 1)].path);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(dirs[Math.max(0, index - 1)].path);
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      void navigate(selected);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(900px, 100%)' }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 18px', alignItems: 'center' }}>
          <button
            className="btn icon"
            disabled={!listing?.parent || loading}
            title="Subir un nivel"
            onClick={() => listing?.parent && void navigate(listing.parent)}
          >
            <Icon name="chevronRight" size={14} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void navigate(pathInput); }}
            placeholder="Escribe o pega una ruta y pulsa Enter"
            style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
          />
          <button className="btn icon" disabled={loading} onClick={() => listing && void navigate(listing.path)} title="Recargar">
            {loading ? <span className="spinner" /> : <Icon name="refresh" size={14} />}
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', gap: 12, paddingTop: 0, minHeight: 340 }}>
          <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 10 }}>
            <span className="panel-title">Equipo</span>
            {roots.map((r) => (
              <div key={r.path} className="tree-row" onClick={() => void navigate(r.path)} title={r.path}>
                <Icon name={r.kind === 'unidad' ? 'folder' : 'folderOpen'} size={13} />
                <span className="name">{r.label}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {problem && (
              <div className="review-banner" style={{ borderColor: 'var(--danger)', marginBottom: 8 }}>
                {problem}
              </div>
            )}

            <div
              ref={listRef}
              tabIndex={0}
              onKeyDown={onListKeyDown}
              style={{ flex: 1, overflow: 'auto', outline: 'none', maxHeight: 300 }}
            >
              {dirs.map((entry) => (
                <div
                  key={entry.path}
                  className={`tree-row ${selected === entry.path ? 'active' : ''}`}
                  onClick={() => setSelected(entry.path)}
                  onDoubleClick={() => void navigate(entry.path)}
                  title={entry.path}
                >
                  <Icon name="folder" size={13} />
                  <span className="name">{entry.name}</span>
                </div>
              ))}
              {files.map((entry) => (
                <div key={entry.path} className="tree-row" style={{ opacity: 0.45, cursor: 'default' }}>
                  <Icon name="file" size={13} />
                  <span className="name">{entry.name}</span>
                </div>
              ))}
              {listing && dirs.length === 0 && files.length === 0 && (
                <p className="hint" style={{ padding: 10 }}>Esta carpeta está vacía.</p>
              )}
            </div>

            {listing?.truncated && (
              <p className="hint">Esta carpeta tiene más elementos de los que se muestran.</p>
            )}

            <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
              />
              Mostrar elementos ocultos
            </label>

            {probe && (
              <div className="card" style={{ marginTop: 8, marginBottom: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-all' }}>{probe.path}</div>
                <p className="meta" style={{ marginTop: 4 }}>
                  {probe.entryCount} elemento(s)
                  {probe.isGitRepo && ' · ya es un repositorio git'}
                  {probe.hasPackageJson && ' · tiene package.json'}
                  {!probe.writable && ' · solo lectura'}
                </p>
                {!probe.writable && probe.isDir && (
                  <p className="hint" style={{ color: 'var(--warn)' }}>
                    No tienes permiso de escritura en esta carpeta: no podrías guardar cambios.
                  </p>
                )}
                {unsafe && (
                  <p className="hint" style={{ color: 'var(--danger)' }}>{probe.unsafeReason}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn outline" onClick={onClose}>Cancelar</button>
          <button
            className="btn primary"
            disabled={!canChoose}
            onClick={() => {
              onChoose(target, probe?.suggestedName ?? target.split(/[\\/]/).filter(Boolean).pop() ?? 'Proyecto');
              onClose();
            }}
          >
            <Icon name="check" size={13} /> Abrir esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}
