import { create } from 'zustand';
import { api } from '../lib/api';
import { panelDe } from '../lib/types';
import { analizarArchivo, forgetFile, isAnalyzable, necesitaGramatica, suggestRelinks } from '../lib/analyzer';
import { detectarHuerfanos, type Huerfano } from '../lib/orphans';
import type {
  AppSettings,
  ApprovedDoc,
  CenterTab,
  ProveedorIA,
  EstadoClave,
  PanelEditor,
  DetectedSymbol,
  DocStatus,
  FunctionDoc,
  LogEntry,
  Project,
  ProjectMemory,
  Proposal,
  TreeNode,
} from '../lib/types';

export interface OpenFile {
  content: string;
  saved: string;
}

interface RelinkSuggestion {
  fromFunctionId: string;
  toFunctionId: string;
  name: string;
  filePath: string;
  previousName: string;
}

/** Vistas del panel lateral izquierdo, seleccionadas desde la barra de actividad. */
export type LeftView = 'explorador' | 'buscar' | 'funciones' | 'git' | 'github' | 'ejecutar';
export type RightTab = 'revision' | 'asistente';
export type BottomTab = 'consola' | 'errores' | 'comprobaciones' | 'terminal' | 'preview' | 'documentacion' | 'git' | 'procesos';

interface State {
  projects: Project[];
  project: Project | null;
  tree: TreeNode[];
  treeTruncated: boolean;
  loadingProject: boolean;

  /** Pestanas del area central: archivos del proyecto y paginas web. */
  tabs: CenterTab[];
  /**
   * La consola del Terminal que se esta viendo.
   *
   * Tiene que ser estado compartido y no privado del panel: cuando se ejecuta
   * un archivo, el backend abre una consola y el panel tiene que engancharse
   * a ESA. Sin esto, el archivo se ejecutaba de verdad pero el usuario veia un
   * terminal vacio y "Abrir la consola", asi que parecia que no pasaba nada.
   */
  terminalSesionId: string | null;
  /** Mitad del editor en la que se abre lo siguiente y donde esta el foco. */
  panelActivo: PanelEditor;
  /** Ultima pestana usada en cada mitad, para que cada una recuerde la suya. */
  ultimoPorPanel: Record<PanelEditor, string | null>;
  activeTabId: string | null;
  files: Record<string, OpenFile>;
  saving: boolean;

  analysis: Record<string, { symbols: DetectedSymbol[]; imports: string[]; classes: string[]; error: string | null }>;
  /** Contenido de los archivos analizados: hace falta para buscar usos. */
  sources: Record<string, string>;
  scanning: boolean;

  approved: Record<string, ApprovedDoc>;
  proposals: Proposal[];
  activeProposalId: string | null;
  generating: boolean;
  relinks: RelinkSuggestion[];

  memory: ProjectMemory | null;
  settings: AppSettings;
  defaultModel: string;
  apiKeyConfigured: boolean;
  /** Los proveedores de IA que conoce la aplicacion. */
  proveedores: ProveedorIA[];
  /** Si cada proveedor tiene clave y de donde sale. */
  claves: Record<string, EstadoClave>;
  /** El nombre del proveedor en uso, para decirlo en la interfaz. */
  proveedorNombre: string;
  gitAvailable: boolean;
  githubConfigured: boolean;

  leftView: LeftView;
  leftOpen: boolean;
  rightTab: RightTab;
  rightOpen: boolean;
  bottomTab: BottomTab;
  bottomOpen: boolean;
  docCenterOpen: boolean;
  settingsOpen: boolean;
  folderPickerOpen: boolean;
  paletteOpen: boolean;
  previewKey: number;
  logs: LogEntry[];
  error: string | null;
  jumpTo: { path: string; line: number } | null;
  /** Pregunta que el asistente debe lanzar en cuanto se monte. */
  pendingAsk: { question: string; contextText: string } | null;
}

interface Actions {
  boot: () => Promise<void>;
  log: (channel: LogEntry['channel'], level: LogEntry['level'], message: string) => void;
  setError: (message: string | null) => void;

  createProject: (name: string, objective: string, root?: string | null) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  deleteProject: (id: string) => Promise<void>;
  saveProjectMeta: (patch: Partial<Project>) => Promise<void>;

  refreshTree: () => Promise<void>;
  restoreSession: (session: { tabs: CenterTab[]; activeTabId: string | null; leftView: string }) => Promise<void>;
  persistSession: () => void;
  openFile: (path: string) => Promise<void>;
  openWebTab: (url: string, title?: string) => void;
  closeTab: (id: string) => void;
  dividirEditor: () => void;
  moverTabAPanel: (id: string, panel: PanelEditor) => void;
  unirEditor: () => void;
  setPanelActivo: (panel: PanelEditor) => void;
  setTerminalSesion: (id: string | null) => void;
  setActiveTab: (id: string) => void;
  updateWebTab: (id: string, url: string) => void;
  editFile: (path: string, content: string) => void;
  saveFile: (path?: string) => Promise<void>;
  saveAll: () => Promise<void>;
  createEntry: (path: string, kind: 'file' | 'dir') => Promise<void>;
  renameEntry: (from: string, to: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;

  scanProject: () => Promise<void>;
  symbols: () => DetectedSymbol[];
  orphans: () => Huerfano[];
  statusOf: (sym: DetectedSymbol) => DocStatus;
  goToSymbol: (sym: DetectedSymbol) => Promise<void>;
  clearJump: () => void;

  generateDoc: (sym: DetectedSymbol, extraInstruction?: string) => Promise<void>;
  approveProposal: (proposalId: string) => Promise<void>;
  editProposal: (proposalId: string, doc: FunctionDoc) => Promise<void>;
  discardProposal: (proposalId: string) => Promise<void>;
  deleteDoc: (functionId: string) => Promise<void>;
  applyRelink: (suggestion: RelinkSuggestion) => Promise<void>;
  dismissRelink: (fromFunctionId: string) => void;

  saveMemory: (memory: Partial<ProjectMemory>) => Promise<void>;
  addDecision: (title: string, rationale: string) => Promise<void>;
  removeDecision: (id: string) => Promise<void>;
  addProgress: (title: string, detail: string, state: string) => Promise<void>;
  updateProgress: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeProgress: (id: string) => Promise<void>;

  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveApiKey: (key: string, proveedor: string) => Promise<void>;
  clearApiKey: (proveedor: string) => Promise<void>;
  refreshConnections: () => Promise<void>;

  setLeftView: (view: LeftView) => void;
  toggleLeft: () => void;
  setRightTab: (tab: RightTab) => void;
  setRightOpen: (open: boolean) => void;
  setBottomTab: (tab: BottomTab) => void;
  toggleBottom: () => void;
  setDocCenterOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setFolderPickerOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  jumpToLine: (path: string, line: number) => void;
  refreshPreview: () => void;
  setActiveProposal: (id: string | null) => void;
  askAssistant: (question: string, contextText: string) => void;
  clearPendingAsk: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  proveedor: 'groq',
  modelos: {},
  ollamaUrl: 'http://localhost:11434/v1',
  model: null,
  temperature: 0.2,
  explanationLevel: 'intermedio',
  maxTokens: 4096,
  editor: {
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    fontFamily: 'default',
    lineHeight: 0,
    letterSpacing: 0,
    fontLigatures: true,
    lineNumbers: 'on',
    indentGuides: true,
    highlightCurrentLine: true,
    stickyScroll: false,
    bracketPairColorization: true,
    autoSave: false,
    autoSaveDelay: 1500,
    emmet: true,
  },
};

/**
 * Temporizadores de autoguardado, uno por archivo. Viven fuera del estado:
 * son detalles de ejecucion, no informacion que la interfaz deba pintar.
 */
const autoSaveTimers = new Map<string, number>();
let sessionTimer: number | null = null;

const MAX_SCAN_FILES = 250;
const fileTabId = (path: string) => `file:${path}`;

export const useStore = create<State & Actions>((set, get) => ({
  projects: [],
  project: null,
  tree: [],
  treeTruncated: false,
  loadingProject: false,
  tabs: [],
  terminalSesionId: null,
  panelActivo: 'a',
  ultimoPorPanel: { a: null, b: null },
  activeTabId: null,
  files: {},
  saving: false,
  analysis: {},
  sources: {},
  scanning: false,
  approved: {},
  proposals: [],
  activeProposalId: null,
  generating: false,
  relinks: [],
  memory: null,
  settings: DEFAULT_SETTINGS,
  defaultModel: '',
  apiKeyConfigured: false,
  proveedores: [],
  claves: {},
  proveedorNombre: 'IA',
  gitAvailable: false,
  githubConfigured: false,
  leftView: 'explorador',
  leftOpen: true,
  rightTab: 'asistente',
  rightOpen: true,
  bottomTab: 'consola',
  bottomOpen: true,
  docCenterOpen: false,
  settingsOpen: false,
  folderPickerOpen: false,
  paletteOpen: false,
  previewKey: 0,
  logs: [],
  error: null,
  jumpTo: null,
  pendingAsk: null,

  log: (channel, level, message) =>
    set((s) => ({
      logs: [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), channel, level, message },
        ...s.logs,
      ].slice(0, 400),
    })),

  setError: (message) => set({ error: message }),

  async boot() {
    try {
      const [{ projects }, settingsRes, health] = await Promise.all([
        api.listProjects(),
        api.settings(),
        api.health(),
      ]);
      set({
        projects,
        settings: settingsRes.settings,
        defaultModel: settingsRes.defaultModel,
        apiKeyConfigured: settingsRes.apiKey.configured,
        proveedores: settingsRes.proveedores,
        claves: settingsRes.claves,
        proveedorNombre: health.ia.nombre,
        gitAvailable: health.git?.available ?? false,
        githubConfigured: health.github?.configured ?? false,
      });
      get().log(
        'sistema',
        health.ia.configured ? 'info' : 'warn',
        health.ia.configured
          ? `Backend conectado. ${health.ia.nombre} listo (clave: ${health.ia.source}).`
          : `Backend conectado, pero ${health.ia.nombre} no está configurado. Ve a Configuración para documentar.`,
      );
      if (!health.git?.available) {
        get().log('git', 'warn', 'Git no está disponible en este equipo: el control de versiones queda desactivado.');
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async refreshConnections() {
    try {
      const health = await api.health();
      set({
        gitAvailable: health.git?.available ?? false,
        githubConfigured: health.github?.configured ?? false,
        apiKeyConfigured: health.ia.configured,
        proveedorNombre: health.ia.nombre,
      });
    } catch {
      /* el aviso de conexión perdida ya lo da cada panel */
    }
  },

  async createProject(name, objective, root = null) {
    const { project } = await api.createProject(name, objective, root);
    set((s) => ({ projects: [project, ...s.projects] }));
    await get().openProject(project.id);
  },

  async openProject(id) {
    set({ loadingProject: true, error: null });
    try {
      const [{ project }, treeRes, docs, { memory }, sessionRes] = await Promise.all([
        api.updateProject(id, {}),
        api.tree(id),
        api.docs(id),
        api.memory(id),
        api.session(id).catch(() => ({ session: { tabs: [], activeTabId: null, leftView: 'explorador' } })),
      ]);
      set({
        project,
        tree: treeRes.tree,
        treeTruncated: treeRes.truncated,
        approved: docs.approved,
        proposals: docs.proposals,
        memory,
        tabs: [],
        activeTabId: null,
        files: {},
        analysis: {},
        sources: {},
        relinks: [],
        activeProposalId: docs.proposals[0]?.id ?? null,
        leftView: (sessionRes.session.leftView as LeftView) || 'explorador',
      });
      get().log('sistema', 'info', `Proyecto abierto: ${project.name}${project.root ? ` (${project.root})` : ''}`);
      if (treeRes.truncated) {
        get().log('sistema', 'warn', 'La carpeta es muy grande: el explorador muestra solo una parte del árbol.');
      }
      await get().scanProject();
      await get().refreshConnections();
      await get().restoreSession(sessionRes.session);
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loadingProject: false });
    }
  },

  /** Reabre las pestanas de la ultima vez, descartando lo que ya no exista. */
  async restoreSession(session) {
    const guardadas = session?.tabs ?? [];
    if (!guardadas.length) return;

    for (const tab of guardadas) {
      // Cada pestana vuelve a la mitad en la que estaba.
      set({ panelActivo: panelDe(tab) });
      if (tab.kind === 'file') await get().openFile(tab.path);
      else if (tab.kind === 'web') get().openWebTab(tab.url, tab.title);
    }
    set({ panelActivo: 'a' });
    // El id guardado puede ya no existir si ese archivo se borro fuera.
    const restaurada = get().tabs.find((t) => t.id === session.activeTabId);
    if (restaurada) {
      // Hay que dejar tambien "la ultima de cada mitad" apuntando aqui. Si no,
      // seguiria senalando al ultimo archivo abierto por el bucle de arriba, y
      // al hacer clic en el editor el foco saltaria a ese otro archivo.
      set((s) => ({
        activeTabId: restaurada.id,
        panelActivo: panelDe(restaurada),
        ultimoPorPanel: { ...s.ultimoPorPanel, [panelDe(restaurada)]: restaurada.id },
      }));
    }

    const recuperadas = get().tabs.length;
    if (recuperadas) {
      get().log('sistema', 'info', `Sesion recuperada: ${recuperadas} pestana(s) reabiertas.`);
    }
  },

  /** Guarda que pestanas hay abiertas, con retardo para no escribir en cada clic. */
  persistSession() {
    const project = get().project;
    if (!project) return;
    if (sessionTimer) window.clearTimeout(sessionTimer);
    sessionTimer = window.setTimeout(() => {
      const { tabs, activeTabId, leftView } = get();
      void api.saveSession(project.id, { tabs, activeTabId, leftView }).catch(() => {
        /* perder la sesion de la interfaz no merece molestar al usuario */
      });
    }, 800);
  },

  closeProject() {
    set({
      project: null, tree: [], tabs: [], activeTabId: null, files: {},
      analysis: {}, approved: {}, proposals: [], memory: null,
    });
  },

  async deleteProject(id) {
    await api.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      project: s.project?.id === id ? null : s.project,
    }));
  },

  async saveProjectMeta(patch) {
    const project = get().project;
    if (!project) return;
    const { project: updated } = await api.updateProject(project.id, patch);
    set((s) => ({ project: updated, projects: s.projects.map((p) => (p.id === updated.id ? updated : p)) }));
  },

  async refreshTree() {
    const project = get().project;
    if (!project) return;
    try {
      const res = await api.tree(project.id);
      set({ tree: res.tree, treeTruncated: res.truncated });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // ------------------------------------------------------------- pestañas

  async openFile(path) {
    const project = get().project;
    if (!project) return;
    const id = fileTabId(path);

    if (get().files[path]) {
      set((s) => ({
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
        tabs: s.tabs.some((t) => t.id === id)
          ? s.tabs
          : [...s.tabs, { kind: 'file', id, path, panel: s.panelActivo }],
      }));
      return;
    }
    try {
      const { content } = await api.readFile(project.id, path);
      set((s) => ({
        files: { ...s.files, [path]: { content, saved: content } },
        tabs: s.tabs.some((t) => t.id === id)
          ? s.tabs
          : [...s.tabs, { kind: 'file', id, path, panel: s.panelActivo }],
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
      }));
      if (isAnalyzable(path)) {
        const analisis = await analizarArchivo(path, content);
        set((s) => ({ analysis: { ...s.analysis, [path]: analisis } }));
      }
      get().persistSession();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  openWebTab(url, title) {
    const id = `web:${url}`;
    set((s) => {
      const existing = s.tabs.find((t) => t.id === id);
      if (existing) return { activeTabId: id };
      return {
        tabs: [...s.tabs, { kind: 'web', id, url, title: title || url, panel: s.panelActivo }],
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
      };
    });
    get().log('procesos', 'info', `Abierto en el navegador integrado: ${url}`);
    get().persistSession();
  },

  updateWebTab(id, url) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.kind === 'web' ? { ...t, url } : t)),
    }));
  },

  closeTab(id) {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const closed = s.tabs.find((t) => t.id === id);
      const files = { ...s.files };
      // El archivo solo se descarga de memoria si no queda abierto en la otra
      // mitad: con el editor dividido puede estar en las dos.
      if (closed?.kind === 'file' && !tabs.some((t) => t.kind === 'file' && t.path === closed.path)) {
        delete files[closed.path];
      }
      // El relevo se busca en la misma mitad: cerrar algo de la derecha no
      // debe saltar el foco a la izquierda.
      const mitad = panelDe(closed);
      const vecinas = tabs.filter((t) => panelDe(t) === mitad);
      const relevo = vecinas[vecinas.length - 1] ?? tabs[tabs.length - 1] ?? null;

      const ultimoPorPanel = { ...s.ultimoPorPanel };
      if (ultimoPorPanel[mitad] === id) ultimoPorPanel[mitad] = vecinas[vecinas.length - 1]?.id ?? null;

      return {
        tabs,
        files,
        ultimoPorPanel,
        // Si la mitad derecha se queda vacia, el foco vuelve a la izquierda.
        panelActivo: tabs.some((t) => panelDe(t) === s.panelActivo) ? s.panelActivo : 'a',
        activeTabId: s.activeTabId === id ? relevo?.id ?? null : s.activeTabId,
      };
    });
    get().persistSession();
  },

  setActiveTab: (id) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      const mitad = panelDe(tab);
      return {
        activeTabId: id,
        panelActivo: mitad,
        ultimoPorPanel: { ...s.ultimoPorPanel, [mitad]: id },
      };
    });
    get().persistSession();
  },

  /**
   * Manda la pestana activa a la otra mitad. Es el gesto de "quiero ver estos
   * dos archivos a la vez": la plantilla y su hoja de estilos, el codigo y su
   * prueba, el archivo y su documentacion.
   */
  dividirEditor() {
    const { activeTabId, tabs } = get();
    const actual = tabs.find((t) => t.id === activeTabId);
    if (!actual) return;
    const destino: PanelEditor = panelDe(actual) === 'a' ? 'b' : 'a';
    get().moverTabAPanel(actual.id, destino);
  },

  moverTabAPanel(id, panel) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, panel } : t)),
      activeTabId: id,
      panelActivo: panel,
      ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: id },
    }));
    get().persistSession();
  },

  /** Deshace la division: todo vuelve a una sola mitad, sin cerrar nada. */
  unirEditor() {
    set((s) => ({
      tabs: s.tabs.map((t) => ({ ...t, panel: 'a' as PanelEditor })),
      panelActivo: 'a',
      ultimoPorPanel: { a: s.activeTabId, b: null },
    }));
    get().persistSession();
  },

  /**
   * Mueve el foco a una mitad del editor.
   *
   * Si la pestana que ya esta activa vive en esa mitad, NO se toca: lo unico
   * que cambia es donde se abrira lo siguiente. Esto importaba mucho mas de lo
   * que parece. Antes se reactivaba siempre "la ultima pestana usada en esta
   * mitad", y como el editor llama aqui al recibir el foco, bastaba con hacer
   * clic dentro para que saltara a otro archivo: la pulsacion se iba con el
   * editor viejo y lo que escribias no llegaba a ninguna parte. Pasaba sobre
   * todo al recuperar una sesion, donde la pestana activa y la ultima abierta
   * casi nunca coinciden.
   */
  setTerminalSesion: (id) => set({ terminalSesionId: id }),

  setPanelActivo: (panel) =>
    set((s) => {
      const actual = s.tabs.find((t) => t.id === s.activeTabId);
      if (actual && panelDe(actual) === panel) {
        return { panelActivo: panel, ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: actual.id } };
      }
      const suya = s.tabs.find((t) => t.id === s.ultimoPorPanel[panel] && panelDe(t) === panel)
        ?? s.tabs.filter((t) => panelDe(t) === panel).at(-1);
      return {
        panelActivo: panel,
        activeTabId: suya?.id ?? s.activeTabId,
        ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: suya?.id ?? s.ultimoPorPanel[panel] },
      };
    }),

  editFile(path, content) {
    set((s) => ({ files: { ...s.files, [path]: { ...s.files[path], content } } }));
    if (isAnalyzable(path)) {
      // El análisis corre en local, en segundo plano: no se envía código a la IA.
      set((s) => ({ sources: { ...s.sources, [path]: content } }));
      void analizarArchivo(path, content).then((analisis) => {
        // Puede haber seguido escribiendo mientras se cargaba la gramática:
        // solo se guarda si este análisis es el del texto que hay ahora.
        if (get().files[path]?.content !== content) return;
        set((s) => ({ analysis: { ...s.analysis, [path]: analisis } }));
      });
    }

    // Autoguardado: se reinicia la cuenta con cada pulsacion, asi que solo
    // escribe cuando el usuario hace una pausa.
    const { autoSave, autoSaveDelay } = get().settings.editor;
    const previo = autoSaveTimers.get(path);
    if (previo) window.clearTimeout(previo);
    if (!autoSave) return;
    autoSaveTimers.set(
      path,
      window.setTimeout(() => {
        autoSaveTimers.delete(path);
        const actual = get().files[path];
        if (actual && actual.content !== actual.saved) void get().saveFile(path);
      }, Math.max(400, autoSaveDelay)),
    );
  },

  async saveFile(path) {
    const project = get().project;
    const active = get().tabs.find((t) => t.id === get().activeTabId);
    const target = path ?? (active?.kind === 'file' ? active.path : null);
    if (!project || !target) return;
    const file = get().files[target];
    if (!file) return;

    set({ saving: true });
    try {
      await api.writeFile(project.id, target, file.content);
      set((s) => ({ files: { ...s.files, [target]: { ...s.files[target], saved: file.content } } }));
      get().log('sistema', 'info', `Guardado: ${target}`);
    } catch (err) {
      set({ error: (err as Error).message });
      get().log('errores', 'error', `No se pudo guardar ${target}: ${(err as Error).message}`);
    } finally {
      set({ saving: false });
    }
  },

  async saveAll() {
    const files = get().files;
    for (const [path, file] of Object.entries(files)) {
      if (file.content !== file.saved) await get().saveFile(path);
    }
    await get().refreshTree();
  },

  async createEntry(path, kind) {
    const project = get().project;
    if (!project) return;
    try {
      await api.createEntry(project.id, path, kind);
      await get().refreshTree();
      if (kind === 'file') await get().openFile(path);
      get().log('sistema', 'info', `Creado: ${path}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async renameEntry(from, to) {
    const project = get().project;
    if (!project) return;
    try {
      await api.rename(project.id, from, to);
      forgetFile(from);
      set((s) => {
        const files = { ...s.files };
        if (files[from]) {
          files[to] = files[from];
          delete files[from];
        }
        return {
          files,
          tabs: s.tabs.map((t) => (t.kind === 'file' && t.path === from ? { ...t, path: to, id: fileTabId(to) } : t)),
          activeTabId: s.activeTabId === fileTabId(from) ? fileTabId(to) : s.activeTabId,
        };
      });
      await get().refreshTree();
      await get().scanProject();
      get().log('sistema', 'info', `Renombrado: ${from} -> ${to}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async deleteEntry(path) {
    const project = get().project;
    if (!project) return;
    try {
      await api.deleteEntry(project.id, path);
      forgetFile(path);
      set((s) => {
        const tabs = s.tabs.filter((t) => !(t.kind === 'file' && t.path.startsWith(path)));
        const files = { ...s.files };
        const analysis = { ...s.analysis };
        for (const key of Object.keys(files)) if (key.startsWith(path)) delete files[key];
        for (const key of Object.keys(analysis)) if (key.startsWith(path)) delete analysis[key];
        return {
          tabs,
          files,
          analysis,
          activeTabId: tabs.some((t) => t.id === s.activeTabId) ? s.activeTabId : tabs[tabs.length - 1]?.id ?? null,
        };
      });
      await get().refreshTree();
      get().log('sistema', 'info', `Eliminado: ${path}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // -------------------------------------------------------------- análisis

  async scanProject() {
    const project = get().project;
    if (!project) return;
    set({ scanning: true });
    try {
      const paths: string[] = [];
      const walk = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.type === 'dir') walk(node.children);
          else if (isAnalyzable(node.path)) paths.push(node.path);
        }
      };
      walk(get().tree);

      const limited = paths.slice(0, MAX_SCAN_FILES);
      if (paths.length > limited.length) {
        get().log('sistema', 'warn', `El proyecto tiene ${paths.length} archivos analizables; se analizaron los primeros ${MAX_SCAN_FILES}.`);
      }

      const analysis = { ...get().analysis };
      const sources: Record<string, string> = {};
      // Los lenguajes que no son del navegador cargan su gramática la primera
      // vez que aparecen. Conviene decirlo: la primera pasada tarda más.
      const gramaticas = new Set(limited.map(necesitaGramatica).filter(Boolean) as string[]);
      if (gramaticas.size) {
        get().log('sistema', 'info', `Cargando el analizador de ${[...gramaticas].sort().join(', ')} para este proyecto.`);
      }
      for (const path of limited) {
        const open = get().files[path];
        const content = open ? open.content : (await api.readFile(project.id, path).catch(() => null))?.content;
        if (typeof content === 'string') {
          analysis[path] = await analizarArchivo(path, content);
          sources[path] = content;
        }
      }
      set({ analysis, sources });

      const current = Object.values(analysis).flatMap((a) => a.symbols);
      const approvedList = Object.values(get().approved).map((a) => ({
        functionId: a.functionId,
        codeHash: a.codeHash,
        name: a.name,
      }));
      set({ relinks: suggestRelinks(approvedList, current) });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ scanning: false });
    }
  },

  symbols() {
    const analysis = get().analysis;
    return Object.keys(analysis)
      .sort()
      .flatMap((path) => analysis[path].symbols)
      .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  },

  /** Elementos de los que no se encuentra ningun uso. Es una sospecha, no un veredicto. */
  orphans() {
    const { sources, files } = get();
    // El contenido del editor manda sobre el del disco: si acabas de usar algo,
    // debe contar aunque no hayas guardado.
    const actual = { ...sources };
    for (const [ruta, archivo] of Object.entries(files)) actual[ruta] = archivo.content;
    return detectarHuerfanos(get().symbols(), actual);
  },

  statusOf(sym) {
    const approved = get().approved[sym.id];
    if (!approved) return 'sin-documentar';
    return approved.codeHash === sym.codeHash ? 'documentada' : 'revisar';
  },

  async goToSymbol(sym) {
    await get().openFile(sym.filePath);
    set({ jumpTo: { path: sym.filePath, line: sym.line } });
  },

  clearJump: () => set({ jumpTo: null }),

  // ---------------------------------------------------------- documentación

  async generateDoc(sym, extraInstruction) {
    const project = get().project;
    if (!project) return;
    set({ generating: true, error: null });
    get().log('documentacion', 'info', `Solicitando explicación de ${sym.name} (${sym.filePath})...`);
    try {
      const fileAnalysis = get().analysis[sym.filePath];
      const open = get().files[sym.filePath];
      const surrounding = open
        ? open.content.split('\n').slice(Math.max(0, sym.line - 16), sym.endLine + 10).join('\n').slice(0, 4000)
        : undefined;

      const result = await api.document({
        projectId: project.id,
        code: sym.code,
        extraInstruction,
        context: {
          functionId: sym.id,
          filePath: sym.filePath,
          language: sym.language,
          lineStart: sym.line,
          kind: sym.kind,
          category: sym.category,
          detail: sym.detail,
          relatedFunctions: fileAnalysis?.symbols.filter((f) => f.id !== sym.id).map((f) => f.qualifiedName) ?? [],
          imports: fileAnalysis?.imports ?? [],
          classes: fileAnalysis?.classes ?? [],
          surrounding,
        },
      });

      if (!result.ok || !result.doc) {
        const detail = result.problems?.join(' ') || 'La respuesta no tiene el formato esperado.';
        get().log('documentacion', 'error', `Respuesta inválida para ${sym.name}: ${detail}`);
        set({ error: `La IA devolvió una respuesta incompleta y no se guardó. ${detail} Puedes volver a solicitarla.` });
        return;
      }

      const { proposals } = await api.saveProposal(project.id, {
        functionId: sym.id,
        name: sym.name,
        filePath: sym.filePath,
        codeHash: sym.codeHash,
        code: sym.code,
        kind: sym.kind,
        doc: result.doc,
        model: result.model,
      });
      set({
        proposals,
        activeProposalId: proposals.find((p) => p.functionId === sym.id)?.id ?? null,
        rightTab: 'revision',
        rightOpen: true,
      });
      get().log('documentacion', 'info', `Propuesta generada para ${sym.name}. Pendiente de tu aprobación.`);
    } catch (err) {
      set({ error: (err as Error).message });
      get().log('documentacion', 'error', (err as Error).message);
    } finally {
      set({ generating: false });
    }
  },

  async approveProposal(proposalId) {
    const project = get().project;
    if (!project) return;
    try {
      const { approved, proposals } = await api.approveProposal(project.id, proposalId);
      set({ approved, proposals, activeProposalId: proposals[0]?.id ?? null });
      get().log('documentacion', 'info', 'Documentación aprobada y guardada como versión oficial.');
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async editProposal(proposalId, doc) {
    const project = get().project;
    if (!project) return;
    const { proposals } = await api.editProposal(project.id, proposalId, doc);
    set({ proposals });
    get().log('documentacion', 'info', 'Propuesta editada manualmente (sigue pendiente de aprobación).');
  },

  async discardProposal(proposalId) {
    const project = get().project;
    if (!project) return;
    const { proposals } = await api.discardProposal(project.id, proposalId);
    set({ proposals, activeProposalId: proposals[0]?.id ?? null });
    get().log('documentacion', 'info', 'Propuesta descartada. La documentación oficial no se modificó.');
  },

  async deleteDoc(functionId) {
    const project = get().project;
    if (!project) return;
    const { approved } = await api.deleteDoc(project.id, functionId);
    set({ approved });
    get().log('documentacion', 'warn', 'Documentación aprobada retirada (se conserva en el historial).');
  },

  async applyRelink(suggestion) {
    const project = get().project;
    if (!project) return;
    const { approved } = await api.relink(project.id, suggestion);
    set((s) => ({ approved, relinks: s.relinks.filter((r) => r.fromFunctionId !== suggestion.fromFunctionId) }));
    get().log('documentacion', 'info', `Documentación reasignada a ${suggestion.name} (${suggestion.filePath}).`);
  },

  dismissRelink: (fromFunctionId) =>
    set((s) => ({ relinks: s.relinks.filter((r) => r.fromFunctionId !== fromFunctionId) })),

  // ------------------------------------------------------------- memoria

  async saveMemory(memory) {
    const project = get().project;
    if (!project) return;
    const res = await api.saveMemory(project.id, memory);
    set({ memory: res.memory });
    get().log('documentacion', 'info', 'Memoria del proyecto actualizada.');
  },

  async addDecision(title, rationale) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.addDecision(project.id, title, rationale);
    set({ memory });
  },

  async removeDecision(id) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.removeDecision(project.id, id);
    set({ memory });
  },

  async addProgress(title, detail, state) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.addProgress(project.id, title, detail, state);
    set({ memory });
  },

  async updateProgress(id, patch) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.updateProgress(project.id, id, patch);
    set({ memory });
  },

  async removeProgress(id) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.removeProgress(project.id, id);
    set({ memory });
  },

  // ------------------------------------------------------------- ajustes

  async saveSettings(patch) {
    const anterior = get().settings.proveedor;
    const { settings } = await api.saveSettings({ ...get().settings, ...patch });
    set({ settings });
    // Al cambiar de servicio de IA cambia tambien si esta listo para usarse y
    // como se llama: sin esto, la aplicacion seguia diciendo el nombre viejo.
    if (settings.proveedor !== anterior) {
      await get().refreshConnections();
      get().log('sistema', 'info', `Servicio de IA: ${get().proveedorNombre}.`);
    }
  },

  async saveApiKey(key, proveedor) {
    await api.saveApiKey(key, proveedor);
    set((s) => ({
      claves: { ...s.claves, [proveedor]: { configured: true, source: 'guardada' } },
      apiKeyConfigured: proveedor === s.settings.proveedor ? true : s.apiKeyConfigured,
    }));
    const nombre = get().proveedores.find((p) => p.id === proveedor)?.nombre ?? proveedor;
    get().log('sistema', 'info', `Clave de ${nombre} guardada en el backend (no se muestra de nuevo).`);
  },

  async clearApiKey(proveedor) {
    const { apiKey } = await api.clearApiKey(proveedor);
    set((s) => ({
      claves: { ...s.claves, [proveedor]: apiKey },
      apiKeyConfigured: proveedor === s.settings.proveedor ? apiKey.configured : s.apiKeyConfigured,
    }));
  },

  // ------------------------------------------------------------------ ui

  setLeftView: (view) => { set((s) => ({ leftView: view, leftOpen: s.leftView === view ? !s.leftOpen : true })); get().persistSession(); },
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),
  setRightOpen: (open) => set({ rightOpen: open }),
  setBottomTab: (tab) => set({ bottomTab: tab, bottomOpen: true }),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  setDocCenterOpen: (open) => set({ docCenterOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setFolderPickerOpen: (open) => set({ folderPickerOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  /** Lleva el cursor a una linea concreta de un archivo ya abierto. */
  jumpToLine: (path, line) => set({ jumpTo: { path, line } }),
  refreshPreview: () => set((s) => ({ previewKey: s.previewKey + 1 })),
  setActiveProposal: (id) => set({ activeProposalId: id }),

  /** Envia una pregunta al asistente y abre su panel. */
  askAssistant: (question, contextText) =>
    set({ pendingAsk: { question, contextText }, rightTab: 'asistente', rightOpen: true }),
  clearPendingAsk: () => set({ pendingAsk: null }),
}));
