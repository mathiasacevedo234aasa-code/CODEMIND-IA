import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/useStore';
import { FolderPicker } from './FolderPicker';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

export function Welcome() {
  const t = useT();
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const loading = useStore((s) => s.loadingProject);

  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [root, setRoot] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [plantilla, setPlantilla] = useState<string>('');
  const [plantillas, setPlantillas] = useState<{ id: string; nombre: string; descripcion: string }[]>([]);
  useEffect(() => { api.plantillas().then((r) => setPlantillas(r.plantillas)).catch(() => {}); }, []);
  /** null = cerrado. "abrir" abre la carpeta ya; "elegir" solo rellena el formulario. */
  const [picker, setPicker] = useState<'abrir' | 'elegir' | null>(null);

  const reset = () => {
    setCreating(false);
    setName('');
    setObjective('');
    setRoot(null);
    setPlantilla('');
  };

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>CodeMind AI</h1>
        <p className="lead">
          {t('Escribe código, entiende lo que construyes y documenta tus funciones cuando tú lo decidas. La IA explica; tú apruebas. Nada se escribe en tus archivos sin tu confirmación.')}
        </p>

        {!creating ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={14} /> {t('Nuevo proyecto')}
              </button>
              <button className="btn outline" onClick={() => setPicker('abrir')}>
                <Icon name="folderOpen" size={14} /> {t('Abrir una carpeta del equipo')}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Puedes trabajar sobre una carpeta que ya tengas en el disco: CodeMind AI lee y escribe
              directamente en ella, y su documentación se guarda aparte, sin ensuciar tu proyecto.
            </p>

            <h3 style={{ fontSize: 13, margin: '24px 0 10px', color: 'var(--text-dim)' }}>{t('Proyectos guardados')}</h3>
            {projects.length === 0 && <p className="hint">Todavía no hay proyectos. Crea el primero o abre una carpeta.</p>}
            {projects.map((p) => (
              <div className="project-row" key={p.id} onClick={() => void openProject(p.id)}>
                <Icon name={p.mode === 'carpeta' ? 'folderOpen' : 'folder'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{p.name}</strong>
                  {p.mode === 'carpeta' && <span className="tag muted" style={{ marginLeft: 6 }}>carpeta del equipo</span>}
                  <div className="hint" style={{ wordBreak: 'break-all' }}>
                    {p.root ?? p.objective ?? 'Sin objetivo definido'} · actualizado{' '}
                    {new Date(p.updatedAt).toLocaleString('es')}
                  </div>
                </div>
                <button
                  className="btn sm danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    const aviso = p.mode === 'carpeta'
                      ? `Se quitará "${p.name}" de CodeMind AI junto con su documentación.\n\nTu carpeta ${p.root} NO se borra.`
                      : `Se eliminará el proyecto "${p.name}" con todos sus archivos y documentación. No se puede deshacer.`;
                    if (window.confirm(aviso)) void deleteProject(p.id);
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </>
        ) : (
          <div className="card">
            <div className="field">
              <label>Nombre del proyecto</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Carpeta</label>
              {root ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{root}</code>
                  <button className="btn sm outline" onClick={() => setRoot(null)}>Quitar</button>
                </div>
              ) : (
                <>
                  <button className="btn outline" onClick={() => setPicker('elegir')}>
                    <Icon name="folderOpen" size={13} /> Elegir una carpeta del equipo
                  </button>
                  <p className="hint">
                    Si no eliges ninguna, CodeMind AI creará un espacio propio para este proyecto.
                  </p>
                </>
              )}
            </div>
            <div className="field">
              <label>Empezar con</label>
              <div className="plantillas">
                {[{ id: '', nombre: 'Vacío', descripcion: 'Sin archivos: empiezas tú.' }, ...plantillas].map((p) => (
                  <button
                    key={p.id || 'vacio'}
                    type="button"
                    className={`plantilla ${plantilla === p.id ? 'elegida' : ''}`}
                    onClick={() => setPlantilla(p.id)}
                  >
                    <strong>{p.nombre}</strong>
                    <span>{p.descripcion}</span>
                  </button>
                ))}
              </div>
              {plantilla && root && (
                <p className="hint">En una carpeta que ya tenga archivos, los que coincidan de nombre no se tocan.</p>
              )}
            </div>
            <div className="field">
              <label>Objetivo del proyecto</label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Qué quieres construir y por qué. Esto alimenta la memoria contextual del proyecto."
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                disabled={!name.trim() || loading}
                onClick={() => void createProject(name, objective, root, plantilla || null)}
              >
                {loading ? <span className="spinner" /> : <Icon name="check" size={13} />} Crear proyecto
              </button>
              <button className="btn outline" onClick={reset}>Cancelar</button>
            </div>
          </div>
        )}

        <p className="hint" style={{ marginTop: 24 }}>
          La documentación, la memoria y el historial se guardan en el disco, dentro de{' '}
          <code>server/data/projects</code>, no en el navegador. Al recargar la página siguen ahí.
        </p>
      </div>

      <FolderPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === 'abrir' ? 'Abrir una carpeta como proyecto' : 'Elegir la carpeta del proyecto'}
        onChoose={(path, suggested) => {
          if (picker === 'abrir') {
            // Abrir es abrir: no se obliga a pasar por el formulario.
            void createProject(suggested, '', path);
            return;
          }
          setRoot(path);
          setCreating(true);
          if (!name.trim()) setName(suggested);
        }}
      />
    </div>
  );
}
