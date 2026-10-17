import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type PreviaPull } from '../lib/api';
import type { ChangeKind, GitHubRepo, GitHubStatus, SyncPreview } from '../lib/types';
import { Icon } from './Icon';

const KIND_TAG: Record<ChangeKind, string> = {
  codigo: 'info',
  documentacion: 'ok',
  configuracion: 'warn',
  otro: 'muted',
};

export function GitHubPanel() {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);
  const refreshConnections = useStore((s) => s.refreshConnections);

  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [token, setToken] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [setUpstream, setSetUpstream] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRepos, setShowRepos] = useState(false);
  const [previa, setPrevia] = useState<PreviaPull | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.githubStatus());
    } catch (err) {
      setError((err as Error).message);
    }
  }, [setError]);

  const loadPreview = useCallback(async () => {
    if (!project) return;
    try {
      setPreview(await api.githubPreview(project.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [project, setError]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => { void loadPreview(); }, [loadPreview]);

  const guard = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await Promise.all([loadStatus(), loadPreview(), refreshConnections()]);
    } catch (err) {
      setError((err as Error).message);
      log('git', 'error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!project) return null;

  // ------------------------------------------------------- sin conexión
  if (status && !status.configured) {
    return (
      <div className="panel-body" style={{ padding: 12 }}>
        <div className="field">
          <label>Token de acceso personal de GitHub</label>
          <input
            type="password"
            autoComplete="off"
            placeholder="ghp_... o github_pat_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={busy || token.trim().length < 20}
            onClick={() => void guard(async () => { await api.githubSaveToken(token.trim()); setToken(''); })}
          >
            {busy ? <span className="spinner" /> : <Icon name="link" size={13} />} Conectar con GitHub
          </button>
        </div>
        <p className="hint">
          Un token de acceso personal autoriza a CodeMind AI a trabajar con tus repositorios. Necesita el permiso{' '}
          <strong>repo</strong> si es un token clásico, o <strong>Contents: lectura y escritura</strong> si es de alcance fino.
        </p>
        <p className="hint">
          Créalo en{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            github.com/settings/tokens
          </a>. Se guarda solo en el backend local y no vuelve nunca a esta pantalla.
        </p>
        <p className="hint">
          Se comprueba contra GitHub antes de guardarlo: si el token no sirve, no se almacena.
        </p>
      </div>
    );
  }

  const visibleRepos = (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="panel-body" style={{ padding: 12 }}>
      {status?.user && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="git" size={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{status.user.login}</strong>
            {status.user.name && <span className="hint"> · {status.user.name}</span>}
            <div className="hint">
              {status.scopes.length ? `Permisos: ${status.scopes.join(', ')}` : 'Token de alcance fino'}
            </div>
          </div>
          <button
            className="btn sm danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('¿Desconectar tu cuenta de GitHub? El token guardado se eliminará del backend.')) {
                void guard(() => api.githubClearToken());
              }
            }}
          >
            Desconectar
          </button>
        </div>
      )}

      {status?.error && <div className="review-banner" style={{ borderColor: 'var(--danger)' }}>{status.error}</div>}

      {/* ------------------------------------------------ elegir repositorio */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 style={{ margin: 0, flex: 1 }}>Repositorio vinculado</h4>
          {preview?.linked ? (
            <span className="tag ok">{preview.remoteUrl?.replace('https://github.com/', '').replace('.git', '')}</span>
          ) : (
            <span className="tag muted">sin vincular</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="btn sm outline"
            disabled={busy}
            onClick={() => {
              setShowRepos((v) => !v);
              if (!repos) void guard(async () => setRepos((await api.githubRepos()).repos));
            }}
          >
            {showRepos ? 'Ocultar repositorios' : 'Elegir repositorio'}
          </button>
          {preview?.linked && (
            <button
              className="btn sm danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('¿Desvincular este proyecto del repositorio remoto? No se borra nada en GitHub.')) {
                  void guard(() => api.githubUnlink(project.id));
                }
              }}
            >
              Desvincular
            </button>
          )}
        </div>

        {showRepos && (
          <div style={{ marginTop: 10 }}>
            <input placeholder="Filtrar por nombre..." value={filter} onChange={(e) => setFilter(e.target.value)} />
            {!repos && <p className="hint" style={{ marginTop: 8 }}><span className="spinner" /> Cargando repositorios...</p>}
            <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
              {visibleRepos.map((repo) => (
                <div key={repo.fullName} className="repo-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{repo.fullName}</div>
                    <div className="hint">
                      rama {repo.defaultBranch}
                      {!repo.canPush && ' · sin permiso de escritura'}
                    </div>
                  </div>
                  <span className={`tag ${repo.private ? 'warn' : 'muted'}`}>{repo.private ? 'privado' : 'público'}</span>
                  <button
                    className="btn sm primary"
                    disabled={busy || !repo.canPush}
                    title={repo.canPush ? 'Vincular con este proyecto' : 'Tu token no puede escribir en este repositorio'}
                    onClick={() => void guard(() => api.githubLink(project.id, repo.fullName))}
                  >
                    Vincular
                  </button>
                </div>
              ))}
              {repos && visibleRepos.length === 0 && <p className="hint">Ningún repositorio coincide.</p>}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------- vista previa de sincronización */}
      {preview && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, flex: 1 }}>Estado de sincronización</h4>
            <button className="btn icon sm" disabled={busy} onClick={() => void loadPreview()} title="Actualizar">
              {busy ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
            </button>
          </div>

          {preview.linked && (
            <p className="meta" style={{ marginTop: 6 }}>
              Destino: <strong>{preview.remote}</strong> · rama <strong>{preview.branch ?? '(desconocida)'}</strong>
              {preview.upstream ? ` · upstream ${preview.upstream}` : ' · sin upstream configurado'}
            </p>
          )}

          {preview.warnings.map((w, i) => (
            <div key={i} className="review-banner" style={{ marginTop: 8, borderColor: 'var(--warn)' }}>{w}</div>
          ))}

          {preview.commitsToPush.length > 0 && (
            <>
              <p className="panel-title" style={{ marginTop: 10 }}>Commits por subir ({preview.commitsToPush.length})</p>
              {preview.commitsToPush.map((c) => (
                <div key={c.hash} className="commit-row">
                  <code>{c.short}</code>
                  <span className="commit-subject">{c.subject}</span>
                </div>
              ))}
            </>
          )}

          {preview.filesToPush.length > 0 && (
            <>
              <p className="panel-title" style={{ marginTop: 10 }}>Archivos que se subirán ({preview.filesToPush.length})</p>
              {preview.filesToPush.map((f) => (
                <div key={f.path} className="git-row" style={{ cursor: 'default' }}>
                  <span className={`tag ${KIND_TAG[f.kind]}`}>{f.kind}</span>
                  <span className="git-path" title={f.path}>{f.path}</span>
                  <span className="git-label">{f.change}</span>
                </div>
              ))}
            </>
          )}

          {preview.conflicts.length > 0 && (
            <div className="review-banner" style={{ marginTop: 8, borderColor: 'var(--danger)' }}>
              Conflictos sin resolver: {preview.conflicts.join(', ')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {!preview.upstream && preview.linked && (
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={setUpstream}
                  onChange={(e) => setSetUpstream(e.target.checked)}
                />
                Establecer esta rama como upstream
              </label>
            )}
            <button
              className="btn primary"
              disabled={busy || !preview.canPush || preview.commitsToPush.length === 0}
              onClick={() => {
                const resumen = `Se subirán ${preview.commitsToPush.length} commit(s) y ${preview.filesToPush.length} archivo(s) a la rama "${preview.branch}" de ${preview.remote}.\n\n¿Continuar?`;
                if (!window.confirm(resumen)) return;
                void guard(async () => {
                  const res = await api.githubPush(project.id, preview.branch ?? '', setUpstream);
                  log('git', 'info', `Subida completada a ${preview.branch}: ${res.output.split('\n').slice(-1)[0]}`);
                });
              }}
            >
              <Icon name="link" size={13} /> Subir a GitHub
            </button>
            <button
              className="btn outline"
              disabled={busy || !preview.linked}
              title="Primero se enseña qué llega; nada cambia hasta que eliges"
              onClick={() =>
                void guard(async () => {
                  setPrevia(await api.githubPullPrevia(project.id, preview.branch ?? ''));
                })
              }
            >
              <Icon name="refresh" size={13} /> Traer cambios...
            </button>
            {preview.conflicts.length > 0 && (
              <button
                className="btn outline"
                disabled={busy}
                title="Vuelve a como estaba todo antes de la fusión o el rebase"
                onClick={() =>
                  void guard(async () => {
                    const r = await api.githubPullAbortar(project.id);
                    log('git', 'info', `Se deshizo el ${r.deshecho} a medias.`);
                  })
                }
              >
                Deshacer fusión a medias
              </button>
            )}
          </div>

          {previa && (
            <div className="review-banner" style={{ marginTop: 10, display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>Antes de traer "{previa.rama}"</strong>
                <span style={{ flex: 1 }} />
                <button className="btn icon sm" onClick={() => setPrevia(null)}><Icon name="close" size={12} /></button>
              </div>
              {previa.suyos === 0 ? (
                <p className="hint">No hay nada nuevo en GitHub. Ya estás al día.</p>
              ) : (
                <>
                  <p className="hint">
                    Llegan {previa.suyos} commit(s).
                    {previa.divergido
                      ? ` Tú tienes ${previa.tuyos} que GitHub no tiene: el historial ha divergido y hay que elegir cómo juntarlos.`
                      : ' Tu rama solo tiene que avanzar: no se mezcla nada.'}
                  </p>
                  {previa.commits.map((c) => (
                    <div key={c.hash} className="commit-row">
                      <code>{c.hash}</code>
                      <span className="commit-subject">{c.asunto}</span>
                      <span className="commit-meta">{c.autor}</span>
                    </div>
                  ))}
                  {previa.enAmbos.length > 0 && (
                    <p className="hint" style={{ color: 'var(--warn)' }}>
                      Cambiados en los dos lados (pueden dar conflicto): {previa.enAmbos.join(', ')}
                    </p>
                  )}
                  {previa.divergido && previa.cambiosSinConfirmar > 0 && (
                    <p className="hint" style={{ color: 'var(--danger)' }}>
                      Tienes {previa.cambiosSinConfirmar} cambio(s) sin confirmar. Confírmalos o guárdalos aparte (stash, en la vista Git) antes de fusionar.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {!previa.divergido && (
                      <button
                        className="btn primary sm"
                        disabled={busy}
                        onClick={() => void guard(async () => {
                          const res = await api.githubPull(project.id, previa.rama, 'ff');
                          log('git', 'info', `Cambios traídos: ${res.output.split('\n').slice(-1)[0]}`);
                          setPrevia(null);
                        })}
                      >
                        Traer (avanzar)
                      </button>
                    )}
                    {previa.divergido && (['merge', 'rebase'] as const).map((modo) => (
                      <button
                        key={modo}
                        className={`btn sm ${modo === 'merge' ? 'primary' : 'outline'}`}
                        disabled={busy || previa.cambiosSinConfirmar > 0}
                        title={modo === 'merge'
                          ? 'Crea un commit que junta las dos historias. No reescribe nada.'
                          : 'Reaplica tus commits encima de los de GitHub. Historia lineal, pero tus commits cambian de identificador.'}
                        onClick={() => void guard(async () => {
                          try {
                            const res = await api.githubPull(project.id, previa.rama, modo);
                            log('git', 'info', `${modo === 'merge' ? 'Fusión' : 'Rebase'} completado: ${res.output.split('\n').slice(-1)[0]}`);
                          } finally {
                            setPrevia(null);
                          }
                        })}
                      >
                        {modo === 'merge' ? 'Fusionar (merge)' : 'Reorganizar (rebase)'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            Antes de traer nada se enseña qué llega. Si el historial ha divergido, eliges tú cómo juntarlo; si hay
            conflictos, CodeMind AI se detiene y puedes deshacerlo todo con un botón.
          </p>
        </div>
      )}
    </div>
  );
}
