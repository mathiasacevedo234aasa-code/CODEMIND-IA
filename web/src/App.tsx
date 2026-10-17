import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useStore } from './state/useStore';
import { TopBar } from './components/TopBar';
import { ActivityRail } from './components/ActivityRail';
import { FileExplorer } from './components/FileExplorer';
import { SymbolsPanel } from './components/SymbolsPanel';
import { SearchPanel } from './components/SearchPanel';
import { CommandPalette } from './components/CommandPalette';
import { GitPanel } from './components/GitPanel';
import { GitHubPanel } from './components/GitHubPanel';
import { RunPanel } from './components/RunPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { BuscarSimbolo } from './components/BuscarSimbolo';
import { Bienvenida } from './components/Bienvenida';
import { ColaCarpetaFlotante, OfertaBorrador } from './components/DocArchivoBarra';
import { ComparacionAbierta } from './components/Comparacion';
import { DocLectura, useDocumentadosDelArchivo } from './components/DocLectura';
import { AssistantPanel } from './components/AssistantPanel';
import { BottomPanel } from './components/BottomPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { FolderPicker } from './components/FolderPicker';
import { Welcome } from './components/Welcome';
import { DialogHost } from './components/DialogHost';
import { Icon } from './components/Icon';
import { useT } from './lib/i18n';
import { useTemaOscuro } from './lib/tema';
import { activarNavegacionTeclado } from './lib/accesibilidad';

/**
 * Lo pesado se carga cuando hace falta, no al arrancar.
 *
 * Monaco por sí solo son varios megabytes: la pantalla de bienvenida no lo
 * necesita, así que llega al abrir un proyecto. El centro de documentación
 * (con su mapa) llega la primera vez que se abre.
 */
const EditorArea = lazy(() =>
  import('./lib/monaco').then(() => import('./components/EditorArea')).then((m) => ({ default: m.EditorArea })));
const DocCenter = lazy(() => import('./components/DocCenter').then((m) => ({ default: m.DocCenter })));

const LEFT_TITLE: Record<string, string> = {
  explorador: 'Explorador',
  buscar: 'Buscar en el proyecto',
  funciones: 'Elementos del proyecto',
  git: 'Control de versiones',
  github: 'GitHub',
  ejecutar: 'Ejecutar y previsualizar',
};

/** Barra de redimensión entre paneles. */
function Resizer({ onDrag }: { onDrag: (dx: number) => void }) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (last.current === null) return;
      onDrag(e.clientX - last.current);
      last.current = e.clientX;
    };
    const up = () => { last.current = null; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [onDrag]);
  return (
    <div
      className="resizer"
      onMouseDown={(e) => { last.current = e.clientX; document.body.style.cursor = 'col-resize'; }}
    />
  );
}

export default function App() {
  const t = useT();
  const idioma = useStore((s) => s.settings.idioma ?? 'es');
  const boot = useStore((s) => s.boot);
  const project = useStore((s) => s.project);
  const theme = useTemaOscuro() ? 'dark' : 'light';
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const respaldoDoc = useStore((s) => s.respaldoDoc);
  const setRespaldoDoc = useStore((s) => s.setRespaldoDoc);
  const generateDoc = useStore((s) => s.generateDoc);
  const files = useStore((s) => s.files);

  const leftView = useStore((s) => s.leftView);
  const leftOpen = useStore((s) => s.leftOpen);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const rightTab = useStore((s) => s.rightTab);
  const documentadosAqui = useDocumentadosDelArchivo();
  const rightOpen = useStore((s) => s.rightOpen);
  const setRightTab = useStore((s) => s.setRightTab);
  const setRightOpen = useStore((s) => s.setRightOpen);
  const proposals = useStore((s) => s.proposals);
  const folderPickerOpen = useStore((s) => s.folderPickerOpen);
  const setFolderPickerOpen = useStore((s) => s.setFolderPickerOpen);
  const createProject = useStore((s) => s.createProject);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const setLeftView = useStore((s) => s.setLeftView);
  const docCenterOpen = useStore((s) => s.docCenterOpen);

  const [left, setLeft] = useState(260);
  const [right, setRight] = useState(380);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.lang = idioma; }, [idioma]);
  const zoom = useStore((s) => s.settings.editor.zoomInterfaz ?? 1);
  const altoContraste = useStore((s) => Boolean(s.settings.editor.altoContraste));
  // Zoom de TODA la interfaz, no solo del texto del editor.
  useEffect(() => { document.documentElement.style.setProperty('zoom', String(zoom)); }, [zoom]);
  useEffect(() => {
    if (altoContraste) document.documentElement.dataset.contraste = 'alto';
    else delete document.documentElement.dataset.contraste;
  }, [altoContraste]);
  useEffect(() => activarNavegacionTeclado(), []);

  // Atajos globales. Se registran una vez y no dependen del foco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        void useStore.getState().reabrirCerrada();
      }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setLeftView('buscar');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen, setLeftView]);

  // Aviso del navegador si hay cambios sin guardar.
  useEffect(() => {
    const dirty = Object.values(files).some((f) => f.content !== f.saved);
    const handler = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [files]);

  return (
    <div className="app">
      <TopBar />

      {!project ? (
        <Welcome />
      ) : (
        <div className="workspace">
          <ActivityRail />

          {leftOpen && (
            <>
              <aside className="panel side" style={{ width: left }}>
                {leftView === 'explorador' ? (
                  <FileExplorer />
                ) : (
                  <>
                    <div className="panel-head">
                      <span className="panel-title">{t(LEFT_TITLE[leftView])}</span>
                      <button className="btn icon sm" onClick={toggleLeft} title={t('Ocultar el panel')}>
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                    {leftView === 'buscar' && <SearchPanel />}
                    {leftView === 'funciones' && <SymbolsPanel />}
                    {leftView === 'git' && <GitPanel />}
                    {leftView === 'github' && <GitHubPanel />}
                    {leftView === 'ejecutar' && <RunPanel />}
                  </>
                )}
              </aside>
              <Resizer onDrag={(dx) => setLeft((v) => Math.min(560, Math.max(190, v + dx)))} />
            </>
          )}

          <div className="center-column">
            <Suspense fallback={<div className="editor-cargando hint">{t('Cargando el editor...')}</div>}>
              <EditorArea />
            </Suspense>
            <BottomPanel />
          </div>

          {rightOpen ? (
            <>
              <Resizer onDrag={(dx) => setRight((v) => Math.min(680, Math.max(300, v - dx)))} />
              <aside className="panel right" style={{ width: right }}>
                <div className="panel-head" style={{ gap: 2 }}>
                  <button
                    className={`tab-btn ${rightTab === 'revision' ? 'active' : ''}`}
                    onClick={() => setRightTab('revision')}
                  >
                    {t('Revisión')}
                    {proposals.length > 0 && <span className="tag info">{proposals.length}</span>}
                  </button>
                  <button
                    className={`tab-btn ${rightTab === 'documentacion' ? 'active' : ''}`}
                    onClick={() => setRightTab('documentacion')}
                    title={t('Lo documentado del archivo que tienes abierto')}
                  >
                    {t('Documentación')}
                    {documentadosAqui > 0 && <span className="tag ok">{documentadosAqui}</span>}
                  </button>
                  <button
                    className={`tab-btn ${rightTab === 'asistente' ? 'active' : ''}`}
                    onClick={() => setRightTab('asistente')}
                  >
                    {t('Asistente')}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button className="btn icon sm" onClick={() => setRightOpen(false)} title={t('Ocultar el panel del asistente')}>
                    <Icon name="close" size={13} />
                  </button>
                </div>
                <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
                  {rightTab === 'revision' && <ReviewPanel />}
                  {rightTab === 'documentacion' && <DocLectura />}
                  {rightTab === 'asistente' && <AssistantPanel />}
                </div>
              </aside>
            </>
          ) : (
            <button
              className="right-handle"
              onClick={() => setRightOpen(true)}
              title={t('Mostrar el panel del asistente')}
              aria-label={t('Mostrar el panel del asistente')}
            >
              <Icon name="brain" size={16} />
              {proposals.length > 0 && <span className="rail-badge">{proposals.length}</span>}
            </button>
          )}
        </div>
      )}

      {docCenterOpen && <Suspense fallback={null}><DocCenter /></Suspense>}
      <SettingsDialog />
      <DialogHost />
      <CommandPalette />
      <BuscarSimbolo />
      <Bienvenida proyectoAbierto={Boolean(project)} />
      <ColaCarpetaFlotante />
      <OfertaBorrador />
      <ComparacionAbierta />

      <FolderPicker
        open={folderPickerOpen}
        onClose={() => setFolderPickerOpen(false)}
        title="Abrir una carpeta como proyecto"
        onChoose={(path, suggested) => void createProject(suggested, '', path)}
      />

      {error && (
        <div className="toast" role="alert">
          <Icon name="warn" />
          <span style={{ flex: 1 }}>{error}</span>
          {respaldoDoc && (
            <button
              className="btn sm"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,.6)' }}
              title={`Manda este elemento a ${respaldoDoc.nombre}, que también tienes configurado`}
              onClick={() => {
                const r = respaldoDoc;
                setError(null);
                setRespaldoDoc(null);
                void generateDoc(r.sym, r.extra, { proveedor: r.proveedor, forzar: true });
              }}
            >
              Reintentar con {respaldoDoc.nombre}
            </button>
          )}
          <button className="btn sm" style={{ color: '#fff' }} onClick={() => { setError(null); setRespaldoDoc(null); }}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
