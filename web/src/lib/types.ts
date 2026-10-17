export interface Project {
  id: string;
  name: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  /** Carpeta real del disco cuando el proyecto vive fuera del espacio gestionado. */
  root: string | null;
  mode: 'interno' | 'carpeta';
}

export type TreeNode =
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }
  | { type: 'file'; name: string; path: string; size: number; mtime: number };

// ------------------------------------------------- explorador del disco real

export interface DiskRoot {
  path: string;
  label: string;
  kind: 'unidad' | 'carpeta';
}

export interface DiskEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size: number;
  mtime: number;
  hidden: boolean;
}

export interface DiskListing {
  path: string;
  parent: string | null;
  entries: DiskEntry[];
  truncated: boolean;
}

export interface DiskProbe {
  path: string;
  exists: boolean;
  isDir: boolean;
  readable: boolean;
  writable: boolean;
  isGitRepo: boolean;
  hasPackageJson: boolean;
  entryCount: number;
  suggestedName: string;
}

// ------------------------------------------------------------------- Git

/** Clasificación del cambio, para distinguir codigo de documentacion y configuracion. */
export type ChangeKind = 'codigo' | 'documentacion' | 'configuracion' | 'otro';

export interface GitChange {
  path: string;
  /** Codigo XY de `git status --porcelain=v1`. */
  code: string;
  label: string;
  kind: ChangeKind;
  renamedFrom?: string;
}

export interface GitStatus {
  /** false si el ejecutable `git` no está disponible en el sistema. */
  available: boolean;
  version: string | null;
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitChange[];
  unstaged: GitChange[];
  untracked: GitChange[];
  conflicts: GitChange[];
  clean: boolean;
  remotes: { name: string; url: string }[];
  message?: string;
}

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  body: string;
}

export interface GitBranches {
  current: string | null;
  local: string[];
  remote: string[];
}

// ---------------------------------------------------------------- GitHub

export interface GitHubStatus {
  configured: boolean;
  user: { login: string; name: string | null; avatarUrl: string | null; htmlUrl: string } | null;
  scopes: string[];
  error?: string;
}

export interface GitHubRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  canPush: boolean;
  updatedAt: string;
}

/** Vista previa obligatoria antes de sincronizar: qué sube, a dónde y con qué riesgos. */
export interface SyncPreview {
  linked: boolean;
  remote: string | null;
  remoteUrl: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  commitsToPush: GitCommit[];
  filesToPush: { path: string; change: 'añadido' | 'modificado' | 'eliminado'; kind: ChangeKind }[];
  uncommitted: number;
  conflicts: string[];
  warnings: string[];
  canPush: boolean;
}

// ------------------------------------------------- ejecucion de proyectos

export interface RunScript {
  name: string;
  command: string;
}

export interface RunScriptsInfo {
  hasPackageJson: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  scripts: RunScript[];
  hasNodeModules: boolean;
  framework: string | null;
  notes: string[];
}

export interface RunProcess {
  id: string;
  label: string;
  command: string;
  cwd: string;
  status: 'iniciando' | 'activo' | 'terminado' | 'error';
  url: string | null;
  port: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

export interface RunLogLine {
  seq: number;
  at: string;
  stream: 'stdout' | 'stderr' | 'sistema';
  text: string;
}

// ------------------------------------------------- busqueda en el proyecto

export interface SearchOptions {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  /** Patrones separados por comas: "*.ts, src/**" */
  include?: string;
  exclude?: string;
}

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  preview: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResults {
  files: SearchFileResult[];
  totalMatches: number;
  totalFiles: number;
  truncated: boolean;
  scanned: number;
}

export interface ReplaceResult {
  applied: boolean;
  files: { path: string; replacements: number }[];
  totalReplacements: number;
}

/** Resultado de comprobar si una URL se puede mostrar incrustada. */
export interface UrlProbe {
  url: string;
  reachable: boolean;
  status: number | null;
  embeddable: boolean;
  reason: string | null;
}

/**
 * Familias de elementos que el analizador reconoce. No solo funciones: un
 * proyecto web se entiende mirando también su estructura HTML y sus estilos.
 */
export type SymbolCategory = 'codigo' | 'estructura' | 'estilo' | 'contenido';

export type SymbolKind =
  // Código ejecutable
  | 'funcion'
  | 'funcion flecha'
  | 'expresion de funcion'
  | 'metodo de clase'
  | 'metodo de objeto'
  | 'componente React'
  | 'hook personalizado'
  | 'funcion exportada por defecto'
  | 'clase'
  | 'interfaz'
  | 'tipo'
  | 'enumeracion'
  | 'constante'
  | 'manejador en linea'
  // Propios de lenguajes que no son del navegador (Python, Java, Go, Rust...)
  | 'constructor de clase'
  | 'propiedad'
  | 'modulo'
  // Estructura de la página
  | 'bloque de script'
  | 'bloque de estilo'
  | 'seccion'
  | 'elemento con id'
  | 'formulario'
  | 'tabla'
  | 'lista'
  | 'componente personalizado'
  | 'enlace'
  | 'multimedia'
  | 'control'
  | 'contenedor'
  | 'metadato'
  | 'texto'
  // Estilos
  | 'regla CSS'
  | 'consulta de medios'
  | 'animacion'
  | 'variable CSS'
  // Contenido
  | 'encabezado';

/** A qué familia pertenece cada tipo, para agrupar y filtrar en el panel. */
export const CATEGORIA_DE: Record<SymbolKind, SymbolCategory> = {
  funcion: 'codigo',
  'funcion flecha': 'codigo',
  'expresion de funcion': 'codigo',
  'metodo de clase': 'codigo',
  'metodo de objeto': 'codigo',
  'componente React': 'codigo',
  'hook personalizado': 'codigo',
  'funcion exportada por defecto': 'codigo',
  clase: 'codigo',
  interfaz: 'codigo',
  tipo: 'codigo',
  enumeracion: 'codigo',
  constante: 'codigo',
  'manejador en linea': 'codigo',
  'constructor de clase': 'codigo',
  propiedad: 'codigo',
  modulo: 'codigo',
  'bloque de script': 'estructura',
  'bloque de estilo': 'estructura',
  seccion: 'estructura',
  'elemento con id': 'estructura',
  formulario: 'estructura',
  tabla: 'estructura',
  lista: 'estructura',
  'componente personalizado': 'estructura',
  multimedia: 'estructura',
  control: 'estructura',
  contenedor: 'estructura',
  metadato: 'estructura',
  enlace: 'contenido',
  texto: 'contenido',
  'regla CSS': 'estilo',
  'consulta de medios': 'estilo',
  animacion: 'estilo',
  'variable CSS': 'estilo',
  encabezado: 'contenido',
};

/** Tipos que reciben argumentos y devuelven algo: solo estos llevan parámetros. */
export const ES_INVOCABLE: ReadonlySet<SymbolKind> = new Set<SymbolKind>([
  'funcion',
  'funcion flecha',
  'expresion de funcion',
  'metodo de clase',
  'metodo de objeto',
  'constructor de clase',
  'componente React',
  'hook personalizado',
  'funcion exportada por defecto',
  'manejador en linea',
]);

export interface DetectedSymbol {
  /** Identidad estable: archivo + nombre cualificado + ocurrencia. No solo el nombre. */
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  category: SymbolCategory;
  /**
   * Elemento de relleno: un parrafo o un div sin id ni clase. Se detecta
   * igual que los demas, pero el panel puede esconderlos para que una pagina
   * grande siga siendo legible.
   */
  menor?: boolean;
  filePath: string;
  line: number;
  endLine: number;
  isAsync: boolean;
  isGenerator: boolean;
  params: string[];
  code: string;
  codeHash: string;
  language: string;
  /** Resumen corto para la lista: atributos del elemento, propiedades de la regla... */
  detail?: string;
}

export interface DocParam {
  nombre: string;
  tipo: string | null;
  descripcion: string;
  certeza: 'confirmado' | 'inferido';
}

export interface DocDependency {
  nombre: string;
  clase: string;
  certeza: 'confirmado' | 'inferido';
}

export interface FunctionDoc {
  nombre: string;
  proposito: string;
  explicacion: string;
  parametros: DocParam[];
  retorno: { descripcion: string; tipo: string | null; certeza: 'confirmado' | 'inferido' };
  flujo: string[];
  dependencias: DocDependency[];
  ejemplo: string;
  observaciones: string;
  incertidumbres?: string[];
}

export interface ApprovedDoc {
  versionId: string;
  functionId: string;
  name: string;
  /** Que clase de elemento se documento: una funcion, una regla CSS, un <form>... */
  kind?: SymbolKind;
  filePath: string;
  codeHash: string | null;
  code: string;
  doc: FunctionDoc;
  approvedAt: string;
  model: string | null;
  edited: boolean;
  relinkedAt?: string;
}

export interface Proposal {
  id: string;
  functionId: string;
  name: string;
  kind?: SymbolKind;
  filePath: string;
  codeHash: string | null;
  code: string;
  doc: FunctionDoc;
  model: string | null;
  createdAt: string;
  edited: boolean;
  editedAt?: string;
}

export interface Decision {
  id: string;
  title: string;
  rationale: string;
  tags: string[];
  createdAt: string;
}

export interface ProgressEntry {
  id: string;
  title: string;
  detail: string;
  state: 'pendiente' | 'en progreso' | 'hecho';
  createdAt: string;
}

export interface ProjectMemory {
  overview: {
    objective: string;
    problem: string;
    audience: string;
    technologies: string;
    status: string;
    implemented: string;
    pending: string;
  };
  architectureNotes: string;
  decisions: Decision[];
  progress: ProgressEntry[];
  updatedAt: string | null;
}

export interface EditorSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  /** Clave de FONT_STACKS, o 'default' para la del sistema. */
  fontFamily: string;
  /** Altura de linea en pixeles. 0 = proporcional al tamano de fuente. */
  lineHeight: number;
  letterSpacing: number;
  fontLigatures: boolean;
  lineNumbers: 'on' | 'off' | 'relative';
  indentGuides: boolean;
  highlightCurrentLine: boolean;
  stickyScroll: boolean;
  bracketPairColorization: boolean;
  /** Guardar solo, tras una pausa al escribir. */
  autoSave: boolean;
  autoSaveDelay: number;
  /** Abreviaturas Emmet: html:5, ul>li*3, div.clase... */
  emmet: boolean;
}

export interface AppSettings {
  /** Que servicio de IA se usa. */
  proveedor: string;
  /** El modelo elegido para cada proveedor, para no perderlo al cambiar. */
  modelos: Record<string, string>;
  /** Donde escucha Ollama, por si no esta en el puerto de siempre. */
  ollamaUrl: string;
  model: string | null;
  temperature: number;
  /** A quién van dirigidas las explicaciones de la IA. */
  explanationLevel: 'principiante' | 'intermedio' | 'avanzado';
  /** Forma de la documentacion que genera la IA. */
  estiloDoc: 'normal' | 'breve' | 'didactico' | 'jsdoc';
  /** Idioma de la interfaz y de lo que escribe la IA. */
  idioma?: 'es' | 'en';
  /** Precio por millón de tokens (USD) por 'proveedor:modelo', puesto por el usuario. */
  precios?: Record<string, { entrada: number; salida: number }>;
  maxTokens: number;
  editor: EditorSettings;
}

export type DocStatus = 'sin-documentar' | 'documentada' | 'revisar';

export type LogChannel = 'console' | 'errores' | 'documentacion' | 'sistema' | 'git' | 'procesos';

export interface LogEntry {
  id: string;
  at: string;
  channel: LogChannel;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/** Una pestaña del área central: un archivo del proyecto o una página web. */
/** En que mitad del editor vive una pestana cuando esta dividido. */
export type PanelEditor = 'a' | 'b';

export type CenterTab =
  | { kind: 'file'; id: string; path: string; panel?: PanelEditor }
  | { kind: 'web'; id: string; url: string; title: string; panel?: PanelEditor };

/**
 * En que mitad esta una pestana. Sin dividir, todas estan en la izquierda; las
 * sesiones guardadas antes de que existiera la division no traen el campo.
 */
export const panelDe = (tab?: CenterTab | null): PanelEditor => tab?.panel ?? 'a';

/** Una comprobacion declarada en el package.json del proyecto del usuario. */
export interface CheckTask {
  id: string;
  clase: 'pruebas' | 'tipos' | 'estilo';
  etiqueta: string;
  descripcion: string;
  comando: string;
}

export interface ChecksInfo {
  tareas: CheckTask[];
  hasNodeModules: boolean;
  packageManager: string | null;
  notas: string[];
}

/** Un aviso situado en un archivo y una linea concretos. */
export interface CheckIssue {
  archivo: string;
  linea: number;
  columna: number;
  nivel: 'error' | 'aviso';
  mensaje: string;
  regla: string | null;
}

export interface CheckResult {
  tarea: { id: string; clase: CheckTask['clase']; etiqueta: string };
  comando: string;
  exitCode: number | null;
  ms: number;
  cortada: boolean;
  error: string | null;
  avisos: CheckIssue[];
  salida: string;
  resumen: { fallidas: number; superadas: number } | null;
  /** Fallo pero no se supo situar el motivo: hay que mostrar la salida cruda. */
  sinLeer: boolean;
  correcto: boolean;
}

// ------------------------------------------------------------- la consola

/** Que clase de consola puede ofrecer este equipo. */
export interface TerminalDisponibilidad {
  shell: string;
  /** "terminal" es un pseudoterminal de verdad; "tuberias" es el plan B. */
  modo: 'terminal' | 'tuberias';
  motivo: string | null;
}

export interface TerminalSesion {
  id: string;
  cwd: string;
  shell: string;
  modo: 'terminal' | 'tuberias';
  estado: 'viva' | 'cerrada' | 'error';
  creada: string;
  exitCode: number | null;
}

export interface TerminalLectura {
  sesion: TerminalSesion;
  trozos: { seq: number; texto: string }[];
  /** La salida mas vieja ya se habia tirado: hay un hueco. */
  recortado: boolean;
}

// ------------------------------------------------------- proveedores de IA

export interface ProveedorIA {
  id: string;
  nombre: string;
  necesitaClave: boolean;
  /** Corre en el propio equipo: el codigo no sale de el. */
  local: boolean;
  modeloPorDefecto: string;
  variableEntorno: string | null;
  donde: string;
  nota: string;
}

export interface EstadoClave {
  configured: boolean;
  source: string | null;
}

export interface PruebaConexion {
  ok: boolean;
  proveedor: string;
  nombre: string;
  source: string | null;
  model?: string;
  modelAvailable?: boolean;
  modelos?: string[];
  message: string;
}

// ----------------------------------------------------------- el glosario

/** Un termino propio del proyecto, ya aprobado por una persona. */
export interface TerminoGlosario {
  id: string;
  termino: string;
  definicion: string;
  aliases: string[];
  /** Archivos donde se vio: lo que hace el glosario comprobable. */
  apariciones: string[];
  notas: string;
  origen: 'persona' | 'propuesta-aprobada';
  creado: string;
  actualizado: string;
}

/** Un candidato propuesto por la IA, a la espera de que alguien lo lea. */
export interface PropuestaGlosario {
  id: string;
  termino: string;
  definicion: string;
  aliases: string[];
  apariciones: string[];
  notas: string;
  propuesto: string;
  modelo: string;
  proveedor: string;
}

export interface Glosario {
  terminos: TerminoGlosario[];
  propuestas: PropuestaGlosario[];
  updatedAt: string | null;
}

// ------------------------------------------- ejecutar un archivo suelto

/** Como se ejecutaria un archivo, y si este equipo puede. */
export interface PlanEjecucion {
  soportado: boolean;
  archivo: string;
  nombre?: string;
  lenguaje?: string;
  comando?: string;
  herramienta?: string;
  disponible?: boolean;
  version?: string | null;
  donde?: string | null;
  /** Por que no se puede, dicho de forma que se pueda arreglar. */
  motivo?: string | null;
  alcance?: 'archivo' | 'proyecto';
  compila?: boolean;
  nota?: string | null;
}

export interface LenguajeDisponible {
  lenguaje: string;
  herramienta: string;
  disponible: boolean;
  version: string | null;
  donde: string | null;
  aviso: string | null;
}

// --------------------------------------------- vista previa en vivo

/** Estado del servidor de vista previa del proyecto. */
export interface EstadoPreview {
  activo: boolean;
  url?: string;
  puerto?: number;
  raiz?: string;
  /** La pagina por la que tiene sentido empezar, si se encontro alguna. */
  entrada?: string | null;
  peticiones?: number;
  arrancado?: string;
  ultimaRecarga?: string | null;
  /** Por ejemplo, que no se pueden vigilar los cambios en esa carpeta. */
  aviso?: string | null;
}
