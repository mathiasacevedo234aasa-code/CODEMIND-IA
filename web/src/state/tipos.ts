import { type Huerfano } from '../lib/orphans';
import type { AppSettings, ApprovedDoc, CenterTab, ProveedorIA, EstadoClave, PanelEditor, DetectedSymbol, DocStatus, FunctionDoc, LogEntry, Project, ProjectMemory, Proposal, TreeNode } from '../lib/types';
import type { StoreApi } from 'zustand';

export interface OpenFile {
  content: string;
  saved: string;
}

export interface RelinkSuggestion {
  fromFunctionId: string;
  toFunctionId: string;
  name: string;
  filePath: string;
  previousName: string;
}

/** Vistas del panel lateral izquierdo, seleccionadas desde la barra de actividad. */
export type LeftView = 'explorador' | 'buscar' | 'funciones' | 'git' | 'github' | 'ejecutar';
/** El progreso de "Documentar archivo". */
export interface ColaDoc {
  activa: boolean;
  ruta: string;
  total: number;
  hechos: number;
  fallidos: { nombre: string; motivo: string }[];
  /** Lo que se esta generando ahora mismo. */
  actual: string | null;
  cancelada: boolean;
  /** En pausa: termina el elemento en curso y espera a que se reanude. */
  pausada?: boolean;
  /** true si `ruta` es una carpeta (o '' para el proyecto entero). */
  carpeta?: boolean;
  /** Si se paro sola por un error que se iba a repetir en todos, cual. */
  motivoParada: string | null;
}

export type RightTab = 'revision' | 'documentacion' | 'asistente';
export type BottomTab = 'consola' | 'errores' | 'comprobaciones' | 'terminal' | 'preview' | 'documentacion' | 'git' | 'procesos';

export interface State {
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
  /** El elemento cuya documentacion se esta leyendo en el panel derecho. */
  symbolSeleccionado: string | null;
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

export interface Actions {
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
  setSymbolSeleccionado: (id: string | null) => void;
  /** Abre la documentacion de un elemento donde se lee: el panel derecho. */
  verDocumentacion: (symbolId: string) => void;
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

  /** Devuelve 'ok', 'invalida' (respuesta mal formada) o el mensaje del error. */
  generateDoc: (sym: DetectedSymbol, extraInstruction?: string, opciones?: { enCola?: boolean; forzar?: boolean }) => Promise<'ok' | 'invalida' | string>;
  /** La cola de "Documentar archivo", si hay una en marcha. */
  colaDoc: ColaDoc | null;
  documentarArchivo: (ruta: string, opciones?: { carpeta?: boolean }) => Promise<void>;
  cancelarColaDoc: () => void;
  pausarColaDoc: (pausada: boolean) => void;
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

/** La tienda entera: estado y acciones. */
export type Tienda = State & Actions;
export type PonerTienda = StoreApi<Tienda>['setState'];
export type ObtenerTienda = () => Tienda;
