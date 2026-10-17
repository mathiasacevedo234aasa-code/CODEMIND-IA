import { create } from 'zustand';
import type { AppSettings } from '../lib/types';
import type { Tienda } from './tipos';
import { crearProyecto } from './slices/proyecto';
import { crearPestanas } from './slices/pestanas';
import { crearAnalisis } from './slices/analisis';
import { crearDocumentacion } from './slices/documentacion';
import { crearMemoriaAjustes } from './slices/memoriaAjustes';
import { crearUi } from './slices/ui';

// Los tipos se siguen pudiendo importar desde aquí, como siempre.
export type { OpenFile, LeftView, ColaDoc, RightTab, BottomTab } from './tipos';

const DEFAULT_SETTINGS: AppSettings = {
  proveedor: 'groq',
  modelos: {},
  ollamaUrl: 'http://localhost:11434/v1',
  model: null,
  temperature: 0.2,
  explanationLevel: 'intermedio',
  estiloDoc: 'normal',
  idioma: 'es',
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
 * El estado de toda la aplicación.
 *
 * Una sola tienda, montada a partir de trozos por tema (state/slices). Cada
 * trozo es una función que recibe `set` y `get` de la tienda entera, así que
 * puede leer y llamar a lo de los demás; separarlos es para poder leerlos,
 * no para aislarlos. Aquí queda el estado inicial.
 */
export const useStore = create<Tienda>((set, get) => ({
  projects: [],
  project: null,
  tree: [],
  treeTruncated: false,
  loadingProject: false,
  tabs: [],
  terminalSesionId: null,
  symbolSeleccionado: null,
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

  ...crearProyecto(set, get),
  ...crearPestanas(set, get),
  ...crearAnalisis(set, get),
  ...crearDocumentacion(set, get),
  ...crearMemoriaAjustes(set, get),
  ...crearUi(set, get),
}));
