import { create } from 'zustand';
import { api } from '../lib/api';
import { analyzeFile, forgetFile, isAnalyzable, suggestRelinks } from '../lib/analyzer';
import type {
  AppSettings,
  ApprovedDoc,
  CenterTab,
  DetectedFunction,
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
export type LeftView = 'explorador' | 'funciones' | 'git' | 'github' | 'ejecutar';
export type RightTab = 'revision' | 'asistente';
export type BottomTab = 'consola' | 'errores' | 'preview' | 'documentacion' | 'git' | 'procesos';

interface State {
  projects: Project[];
  project: Project | null;
  tree: TreeNode[];
  treeTruncated: boolean;
  loadingProject: boolean;

  /** Pestanas del area central: archivos del proyecto y paginas web. */
  tabs: CenterTab[];
  activeTabId: string | null;
  files: Record<string, OpenFile>;
  saving: boolean;

  analysis: Record<string, { functions: DetectedFunction[]; imports: string[]; classes: string[]; error: string | null }>;
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
  previewKey: number;
  logs: LogEntry[];
  error: string | null;
  jumpTo: { path: string; line: number } | null;
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
  openFile: (path: string) => Promise<void>;
  openWebTab: (url: string, title?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateWebTab: (id: string, url: string) => void;
  editFile: (path: string, content: string) => void;
  saveFile: (path?: string) => Promise<void>;
  saveAll: () => Promise<void>;
  createEntry: (path: string, kind: 'file' | 'dir') => Promise<void>;
  renameEntry: (from: string, to: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;

  scanProject: () => Promise<void>;
  functions: () => DetectedFunction[];
  statusOf: (fn: DetectedFunction) => DocStatus;
  goToFunction: (fn: DetectedFunction) => Promise<void>;
  clearJump: () => void;

  generateDoc: (fn: DetectedFunction, extraInstruction?: string) => Promise<void>;
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
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
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
  refreshPreview: () => void;
  setActiveProposal: (id: string | null) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  model: null,
  temperature: 0.2,
  maxTokens: 4096,
  editor: { theme: 'dark', fontSize: 14, tabSize: 2, wordWrap: true, minimap: false },
};

const MAX_SCAN_FILES = 250;
const fileTabId = (path: string) => `file:${path}`;

export const useStore = create<State & Actions>((set, get) => ({
  projects: [],
  project: null,
  tree: [],
  treeTruncated: false,
  loadingProject: false,
  tabs: [],
  activeTabId: null,
  files: {},
  saving: false,
  analysis: {},
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
  previewKey: 0,
  logs: [],
  error: null,
  jumpTo: null,

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
        gitAvailable: health.git?.available ?? false,
        githubConfigured: health.github?.configured ?? false,
      });
      get().log(
        'sistema',
        health.groq.configured ? 'info' : 'warn',
        health.groq.configured
          ? `Backend conectado. Groq configurado (origen: ${health.groq.source}).`
          : 'Backend conectado, pero no hay API key de Groq. Configúrala para documentar.',
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
        apiKeyConfigured: health.groq.configured,
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
      const [{ project }, treeRes, docs, { memory }] = await Promise.all([
        api.updateProject(id, {}),
        api.tree(id),
        api.docs(id),
        api.memory(id),
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
        relinks: [],
        activeProposalId: docs.proposals[0]?.id ?? null,
        leftView: 'explorador',
      });
      get().log('sistema', 'info', `Proyecto abierto: ${project.name}${project.root ? ` (${project.root})` : ''}`);
      if (treeRes.truncated) {
        get().log('sistema', 'warn', 'La carpeta es muy grande: el explorador muestra solo una parte del árbol.');
      }
      await get().scanProject();
      await get().refreshConnections();
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loadingProject: false });
    }
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
        tabs: s.tabs.some((t) => t.id === id) ? s.tabs : [...s.tabs, { kind: 'file', id, path }],
      }));
      return;
    }
    try {
      const { content } = await api.readFile(project.id, path);
      set((s) => ({
        files: { ...s.files, [path]: { content, saved: content } },
        tabs: s.tabs.some((t) => t.id === id) ? s.tabs : [...s.tabs, { kind: 'file', id, path }],
        activeTabId: id,
      }));
      if (isAnalyzable(path)) {
        set((s) => ({ analysis: { ...s.analysis, [path]: analyzeFile(path, content) } }));
      }
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
        tabs: [...s.tabs, { kind: 'web', id, url, title: title || url }],
        activeTabId: id,
      };
    });
    get().log('procesos', 'info', `Abierto en el navegador integrado: ${url}`);
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
      if (closed?.kind === 'file') delete files[closed.path];
      return {
        tabs,
        files,
        activeTabId: s.activeTabId === id ? tabs[tabs.length - 1]?.id ?? null : s.activeTabId,
      };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  editFile(path, content) {
    set((s) => ({ files: { ...s.files, [path]: { ...s.files[path], content } } }));
    if (isAnalyzable(path)) {
      // El análisis corre en local, en segundo plano: no se envía código a la IA.
      set((s) => ({ analysis: { ...s.analysis, [path]: analyzeFile(path, content) } }));
    }
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
      for (const path of limited) {
        const open = get().files[path];
        const content = open ? open.content : (await api.readFile(project.id, path).catch(() => null))?.content;
        if (typeof content === 'string') analysis[path] = analyzeFile(path, content);
      }
      set({ analysis });

      const current = Object.values(analysis).flatMap((a) => a.functions);
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

  functions() {
    const analysis = get().analysis;
    return Object.keys(analysis)
      .sort()
      .flatMap((path) => analysis[path].functions)
      .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  },

  statusOf(fn) {
    const approved = get().approved[fn.id];
    if (!approved) return 'sin-documentar';
    return approved.codeHash === fn.codeHash ? 'documentada' : 'revisar';
  },

  async goToFunction(fn) {
    await get().openFile(fn.filePath);
    set({ jumpTo: { path: fn.filePath, line: fn.line } });
  },

  clearJump: () => set({ jumpTo: null }),

  // ---------------------------------------------------------- documentación

  async generateDoc(fn, extraInstruction) {
    const project = get().project;
    if (!project) return;
    set({ generating: true, error: null });
    get().log('documentacion', 'info', `Solicitando explicación de ${fn.name} (${fn.filePath})...`);
    try {
      const fileAnalysis = get().analysis[fn.filePath];
      const open = get().files[fn.filePath];
      const surrounding = open
        ? open.content.split('\n').slice(Math.max(0, fn.line - 16), fn.endLine + 10).join('\n').slice(0, 4000)
        : undefined;

      const result = await api.document({
        projectId: project.id,
        code: fn.code,
        extraInstruction,
        context: {
          functionId: fn.id,
          filePath: fn.filePath,
          language: fn.language,
          lineStart: fn.line,
          relatedFunctions: fileAnalysis?.functions.filter((f) => f.id !== fn.id).map((f) => f.qualifiedName) ?? [],
          imports: fileAnalysis?.imports ?? [],
          classes: fileAnalysis?.classes ?? [],
          surrounding,
        },
      });

      if (!result.ok || !result.doc) {
        const detail = result.problems?.join(' ') || 'La respuesta no tiene el formato esperado.';
        get().log('documentacion', 'error', `Respuesta inválida para ${fn.name}: ${detail}`);
        set({ error: `La IA devolvió una respuesta incompleta y no se guardó. ${detail} Puedes volver a solicitarla.` });
        return;
      }

      const { proposals } = await api.saveProposal(project.id, {
        functionId: fn.id,
        name: fn.name,
        filePath: fn.filePath,
        codeHash: fn.codeHash,
        code: fn.code,
        doc: result.doc,
        model: result.model,
      });
      set({
        proposals,
        activeProposalId: proposals.find((p) => p.functionId === fn.id)?.id ?? null,
        rightTab: 'revision',
        rightOpen: true,
      });
      get().log('documentacion', 'info', `Propuesta generada para ${fn.name}. Pendiente de tu aprobación.`);
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
    const { settings } = await api.saveSettings({ ...get().settings, ...patch });
    set({ settings });
  },

  async saveApiKey(key) {
    await api.saveApiKey(key);
    set({ apiKeyConfigured: true });
    get().log('sistema', 'info', 'API key de Groq guardada en el backend (no se muestra de nuevo).');
  },

  async clearApiKey() {
    const { apiKey } = await api.clearApiKey();
    set({ apiKeyConfigured: apiKey.configured });
  },

  // ------------------------------------------------------------------ ui

  setLeftView: (view) => set((s) => ({ leftView: view, leftOpen: s.leftView === view ? !s.leftOpen : true })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),
  setRightOpen: (open) => set({ rightOpen: open }),
  setBottomTab: (tab) => set({ bottomTab: tab, bottomOpen: true }),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  setDocCenterOpen: (open) => set({ docCenterOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setFolderPickerOpen: (open) => set({ folderPickerOpen: open }),
  refreshPreview: () => set((s) => ({ previewKey: s.previewKey + 1 })),
  setActiveProposal: (id) => set({ activeProposalId: id }),
}));
