import type {
  AppSettings,
  ApprovedDoc,
  CenterTab,
  DiskListing,
  DiskProbe,
  DiskRoot,
  FunctionDoc,
  GitBranches,
  GitCommit,
  GitHubRepo,
  GitHubStatus,
  GitStatus,
  Project,
  ProjectMemory,
  Proposal,
  RunLogLine,
  RunProcess,
  RunScriptsInfo,
  SearchOptions,
  SearchResults,
  ReplaceResult,
  SyncPreview,
  TreeNode,
  UrlProbe,
  ChecksInfo,
  EstadoPreview,
  PlanEjecucion,
  LenguajeDisponible,
  ProveedorIA,
  EstadoClave,
  PruebaConexion,
  Glosario,
  TerminalDisponibilidad,
  TerminalSesion,
  TerminalLectura,
  CheckResult,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error('No se pudo contactar con el backend de CodeMind AI. Comprueba que este en ejecucion.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const problems = Array.isArray(data.problems) ? ` (${data.problems.join(' ')})` : '';
    throw new Error(`${data.error ?? `Error ${res.status}`}${problems}`);
  }
  return data as T;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

/**
 * Lee una respuesta que llega a trozos ("server-sent events").
 *
 * No se usa EventSource porque solo admite GET, y la pregunta con su contexto
 * no cabe en una URL. Se lee el cuerpo de un POST a mano: cada evento es una
 * línea `event:` y otra `data:`, separados por una línea en blanco.
 */
async function leerStream(
  url: string,
  payload: Record<string, unknown>,
  alTrozo: (texto: string) => void,
  senal?: AbortSignal,
): Promise<{ model: string; proveedor: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: senal,
  });
  if (!res.ok || !res.body) throw new Error(`El servidor respondió ${res.status}.`);

  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let pendiente = '';
  let fin: { model: string; proveedor: string } | null = null;

  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += dec.decode(value, { stream: true });

    let corte = pendiente.indexOf('\n\n');
    while (corte !== -1) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);
      corte = pendiente.indexOf('\n\n');

      const evento = /^event: (.+)$/m.exec(bloque)?.[1]?.trim();
      const datos = /^data: (.*)$/m.exec(bloque)?.[1];
      if (!evento || datos === undefined) continue;
      const json = JSON.parse(datos);

      if (evento === 'trozo') alTrozo(json.t);
      else if (evento === 'fin') fin = json;
      else if (evento === 'error') throw new Error(json.error);
    }
  }

  if (!fin) throw new Error('La respuesta se cortó antes de terminar.');
  return fin;
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      defaultModel: string;
      ia: { proveedor: string; nombre: string; configured: boolean; source: string | null };
      git: { available: boolean; version: string | null };
      github: { configured: boolean };
    }>('/api/health'),

  // explorador del disco real
  diskRoots: () => request<{ roots: DiskRoot[] }>('/api/fs/roots'),
  diskList: (path: string, showHidden = false) =>
    request<DiskListing>(`/api/fs/list?path=${encodeURIComponent(path)}&hidden=${showHidden ? '1' : '0'}`),
  diskProbe: (path: string) =>
    request<DiskProbe & { safe: boolean; unsafeReason: string | null }>(
      `/api/fs/probe?path=${encodeURIComponent(path)}`,
    ),
  createDiskFolder: (parent: string, name: string) =>
    request<{ path: string; name: string }>('/api/fs/folder', { method: 'POST', ...json({ parent, name }) }),

  // proyectos
  listProjects: () => request<{ projects: Project[] }>('/api/projects'),
  createProject: (name: string, objective: string, root?: string | null, plantilla?: string | null) =>
    request<{ project: Project; plantilla?: { escritos: string[]; respetados: string[] } }>(
      '/api/projects', { method: 'POST', ...json({ name, objective, root, plantilla: plantilla || undefined }) }),
  plantillas: () =>
    request<{ plantillas: { id: string; nombre: string; descripcion: string; archivos: string[] }[] }>('/api/projects/plantillas'),
  updateProject: (id: string, patch: Partial<Project>) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', ...json(patch) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // archivos
  tree: (id: string) =>
    request<{ tree: TreeNode[]; truncated: boolean; root: string }>(`/api/projects/${id}/tree`),
  readFile: (id: string, path: string) =>
    request<{ path: string; content: string; mtime: number; size: number }>(
      `/api/projects/${id}/file?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (id: string, path: string, content: string) =>
    request<{ path: string; mtime: number }>(`/api/projects/${id}/file`, { method: 'PUT', ...json({ path, content }) }),
  createEntry: (id: string, path: string, kind: 'file' | 'dir') =>
    request<{ path: string }>(`/api/projects/${id}/entry`, { method: 'POST', ...json({ path, kind }) }),
  rename: (id: string, from: string, to: string) =>
    request<{ from: string; to: string }>(`/api/projects/${id}/rename`, { method: 'POST', ...json({ from, to }) }),
  historialLocal: (id: string, path: string) =>
    request<{ versiones: VersionLocal[] }>(`/api/projects/${id}/historial-local?path=${encodeURIComponent(path)}`),
  versionLocal: (id: string, path: string, v: string) =>
    request<{ contenido: string }>(`/api/projects/${id}/historial-local/version?path=${encodeURIComponent(path)}&v=${encodeURIComponent(v)}`),
  leerBorrador: (id: string) => request<{ content: string }>(`/api/projects/${id}/borrador`),
  guardarBorrador: (id: string, content: string) =>
    request<{ ok: true }>(`/api/projects/${id}/borrador`, { method: 'PUT', ...json({ content }) }),
  copyEntry: (id: string, from: string, to: string) =>
    request<{ from: string; to: string }>(`/api/projects/${id}/copy`, { method: 'POST', ...json({ from, to }) }),
  deleteEntry: (id: string, path: string) =>
    request<{ path: string }>(`/api/projects/${id}/entry?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),

  // documentacion
  docs: (id: string) =>
    request<{ approved: Record<string, ApprovedDoc>; proposals: Proposal[] }>(`/api/projects/${id}/docs`),
  saveProposal: (id: string, payload: Record<string, unknown>) =>
    request<{ proposal: Proposal; proposals: Proposal[] }>(`/api/projects/${id}/proposals`, {
      method: 'POST',
      ...json(payload),
    }),
  editProposal: (id: string, proposalId: string, doc: FunctionDoc) =>
    request<{ proposal: Proposal; proposals: Proposal[] }>(`/api/projects/${id}/proposals/${proposalId}`, {
      method: 'PATCH',
      ...json({ doc }),
    }),
  discardProposal: (id: string, proposalId: string) =>
    request<{ proposals: Proposal[] }>(`/api/projects/${id}/proposals/${proposalId}`, { method: 'DELETE' }),
  approveProposal: (id: string, proposalId: string) =>
    request<{ approved: Record<string, ApprovedDoc>; proposals: Proposal[] }>(
      `/api/projects/${id}/proposals/${proposalId}/approve`,
      { method: 'POST' },
    ),
  relink: (id: string, payload: { fromFunctionId: string; toFunctionId: string; name: string; filePath: string }) =>
    request<{ approved: Record<string, ApprovedDoc> }>(`/api/projects/${id}/docs/relink`, {
      method: 'POST',
      ...json(payload),
    }),
  deleteDoc: (id: string, functionId: string) =>
    request<{ approved: Record<string, ApprovedDoc> }>(
      `/api/projects/${id}/docs/${encodeURIComponent(functionId)}`,
      { method: 'DELETE' },
    ),
  history: (id: string, functionId?: string) =>
    request<{ versions: ApprovedDoc[] }>(
      `/api/projects/${id}/history${functionId ? `?functionId=${encodeURIComponent(functionId)}` : ''}`,
    ),

  // sesion de trabajo
  session: (id: string) =>
    request<{ session: { tabs: CenterTab[]; activeTabId: string | null; leftView: string } }>(
      `/api/projects/${id}/session`,
    ),
  saveSession: (id: string, session: { tabs: CenterTab[]; activeTabId: string | null; leftView: string }) =>
    request<{ ok: true }>(`/api/projects/${id}/session`, { method: 'PUT', ...json({ session }) }),

  // memoria
  memory: (id: string) => request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory`),
  saveMemory: (id: string, memory: Partial<ProjectMemory>) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory`, { method: 'PUT', ...json({ memory }) }),
  addDecision: (id: string, title: string, rationale: string) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory/decisions`, {
      method: 'POST',
      ...json({ title, rationale }),
    }),
  removeDecision: (id: string, decisionId: string) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory/decisions/${decisionId}`, { method: 'DELETE' }),
  addProgress: (id: string, title: string, detail: string, state: string) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory/progress`, {
      method: 'POST',
      ...json({ title, detail, state }),
    }),
  updateProgress: (id: string, entryId: string, patch: Record<string, unknown>) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory/progress/${entryId}`, {
      method: 'PATCH',
      ...json(patch),
    }),
  removeProgress: (id: string, entryId: string) =>
    request<{ memory: ProjectMemory }>(`/api/projects/${id}/memory/progress/${entryId}`, { method: 'DELETE' }),

  // IA
  document: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; problems: string[]; doc: FunctionDoc | null; model: string; cacheado?: boolean }>('/api/ai/document', {
      method: 'POST',
      ...json(payload),
    }),
  chat: (payload: Record<string, unknown>) =>
    request<{ answer: string; model: string }>('/api/ai/chat', { method: 'POST', ...json(payload) }),
  chatStream: (payload: Record<string, unknown>, alTrozo: (texto: string) => void, senal?: AbortSignal) =>
    leerStream('/api/ai/chat/stream', payload, alTrozo, senal),
  models: (proveedor?: string) =>
    request<{ models: { id: string }[] }>(`/api/ai/models${proveedor ? `?proveedor=${encodeURIComponent(proveedor)}` : ''}`),
  proveedores: () => request<{ proveedores: ProveedorIA[] }>('/api/ai/proveedores'),
  probarIA: (proveedor?: string) =>
    request<PruebaConexion>(`/api/ai/test${proveedor ? `?proveedor=${encodeURIComponent(proveedor)}` : ''}`),

  conversaciones: (id: string) => request<{ conversaciones: Conversacion[] }>(`/api/projects/${id}/conversaciones`),
  guardarConversacion: (id: string, conversacion: { id?: string; titulo?: string; mensajes: Conversacion['mensajes'] }) =>
    request<{ conversacion: Conversacion }>(`/api/projects/${id}/conversaciones`, { method: 'PUT', ...json({ conversacion }) }),
  borrarConversacion: (id: string, cid: string) =>
    request<{ ok: true }>(`/api/projects/${id}/conversaciones/${encodeURIComponent(cid)}`, { method: 'DELETE' }),

  glosario: (id: string) => request<Glosario>(`/api/projects/${id}/glosario`),
  glosarioProponer: (id: string, elementos: { nombre: string; tipo: string; archivo: string }[]) =>
    request<{ glosario: Glosario; nuevas: number; descartadas: number; modelo: string; proveedor: string }>(
      `/api/projects/${id}/glosario/proponer`, { method: 'POST', ...json({ elementos }) }),
  glosarioAnadir: (id: string, termino: Record<string, unknown>) =>
    request<Glosario>(`/api/projects/${id}/glosario`, { method: 'POST', ...json(termino) }),
  glosarioEditar: (id: string, terminoId: string, termino: Record<string, unknown>) =>
    request<Glosario>(`/api/projects/${id}/glosario/${terminoId}`, { method: 'PUT', ...json(termino) }),
  glosarioBorrar: (id: string, terminoId: string) =>
    request<Glosario>(`/api/projects/${id}/glosario/${terminoId}`, { method: 'DELETE' }),
  glosarioAprobar: (id: string, propuestaId: string) =>
    request<Glosario>(`/api/projects/${id}/glosario/propuestas/${propuestaId}/aprobar`, { method: 'POST' }),
  glosarioDescartar: (id: string, propuestaId: string) =>
    request<Glosario>(`/api/projects/${id}/glosario/propuestas/${propuestaId}`, { method: 'DELETE' }),

  settings: () =>
    request<{
      settings: AppSettings;
      proveedores: ProveedorIA[];
      defaultModel: string;
      apiKey: EstadoClave;
      claves: Record<string, EstadoClave>;
    }>(
      '/api/settings',
    ),
  saveSettings: (settings: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>('/api/settings', { method: 'PUT', ...json({ settings }) }),
  saveApiKey: (apiKey: string, proveedor: string) =>
    request<{ apiKey: EstadoClave }>('/api/settings/api-key', { method: 'PUT', ...json({ apiKey, proveedor }) }),
  clearApiKey: (proveedor: string) =>
    request<{ apiKey: EstadoClave }>(`/api/settings/api-key?proveedor=${encodeURIComponent(proveedor)}`, { method: 'DELETE' }),

  // ------------------------------------------------------------------ Git
  gitStatus: (id: string) => request<GitStatus>(`/api/projects/${id}/git/status`),
  gitInit: (id: string) => request<{ ok: true; root: string }>(`/api/projects/${id}/git/init`, { method: 'POST' }),
  gitDiff: (id: string, path: string, staged: boolean) =>
    request<{ diff: string; binary: boolean }>(
      `/api/projects/${id}/git/diff?path=${encodeURIComponent(path)}&staged=${staged ? '1' : '0'}`,
    ),
  gitStage: (id: string, paths: string[]) =>
    request<GitStatus>(`/api/projects/${id}/git/stage`, { method: 'POST', ...json({ paths }) }),
  gitUnstage: (id: string, paths: string[]) =>
    request<GitStatus>(`/api/projects/${id}/git/unstage`, { method: 'POST', ...json({ paths }) }),
  gitCommit: (id: string, message: string) =>
    request<{ commit: GitCommit; status: GitStatus }>(`/api/projects/${id}/git/commit`, {
      method: 'POST',
      ...json({ message }),
    }),
  gitLog: (id: string, limit = 40) => request<{ commits: GitCommit[] }>(`/api/projects/${id}/git/log?limit=${limit}`),
  gitBranches: (id: string) => request<GitBranches>(`/api/projects/${id}/git/branches`),
  gitCheckout: (id: string, branch: string, create = false) =>
    request<{ status: GitStatus }>(`/api/projects/${id}/git/checkout`, {
      method: 'POST',
      ...json({ branch, create }),
    }),

  // --------------------------------------------------------------- GitHub
  githubStatus: () => request<GitHubStatus>('/api/github/status'),
  githubSaveToken: (token: string) =>
    request<GitHubStatus>('/api/github/token', { method: 'PUT', ...json({ token }) }),
  githubClearToken: () => request<GitHubStatus>('/api/github/token', { method: 'DELETE' }),
  githubRepos: (query = '') =>
    request<{ repos: GitHubRepo[] }>(`/api/github/repos${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  githubLink: (id: string, fullName: string) =>
    request<{ remote: string; url: string }>(`/api/projects/${id}/github/link`, {
      method: 'POST',
      ...json({ fullName }),
    }),
  githubUnlink: (id: string) => request<{ ok: true }>(`/api/projects/${id}/github/link`, { method: 'DELETE' }),
  githubPreview: (id: string) => request<SyncPreview>(`/api/projects/${id}/github/preview`),
  githubPush: (id: string, branch: string, setUpstream: boolean) =>
    request<{ output: string; preview: SyncPreview }>(`/api/projects/${id}/github/push`, {
      method: 'POST',
      ...json({ branch, setUpstream }),
    }),
  githubPull: (id: string, branch: string, modo: 'ff' | 'merge' | 'rebase' = 'ff') =>
    request<{ output: string; preview: SyncPreview }>(`/api/projects/${id}/github/pull`, {
      method: 'POST',
      ...json({ branch, modo }),
    }),
  githubPullPrevia: (id: string, branch: string) =>
    request<PreviaPull>(`/api/projects/${id}/github/pull/previa?branch=${encodeURIComponent(branch)}`),
  githubPullAbortar: (id: string) =>
    request<{ deshecho: string }>(`/api/projects/${id}/github/pull/abortar`, { method: 'POST' }),
  gitVersiones: (id: string, path: string, staged: boolean) =>
    request<{ binary: boolean; antes: string; despues: string }>(
      `/api/projects/${id}/git/versiones?path=${encodeURIComponent(path)}&staged=${staged ? '1' : '0'}`,
    ),
  gitDeshacerCommit: (id: string) =>
    request<{ deshecho: string; status: GitStatus }>(`/api/projects/${id}/git/deshacer-commit`, { method: 'POST' }),
  gitStashListar: (id: string) => request<{ lista: StashEntrada[] }>(`/api/projects/${id}/git/stash`),
  gitStash: (id: string, cuerpo: { accion?: 'guardar' | 'recuperar' | 'descartar'; ref?: string; mensaje?: string }) =>
    request<{ lista: StashEntrada[]; status: GitStatus }>(`/api/projects/${id}/git/stash`, { method: 'POST', ...json(cuerpo) }),

  // ------------------------------------------------------------ ejecución
  runScripts: (id: string) => request<RunScriptsInfo>(`/api/projects/${id}/run/scripts`),
  runStart: (id: string, payload: { script?: string; command?: string; args?: string[]; label?: string }) =>
    request<{ process: RunProcess }>(`/api/projects/${id}/run/start`, { method: 'POST', ...json(payload) }),
  ejecuciones: (id: string) => request<{ ejecuciones: EjecucionResumen[] }>(`/api/projects/${id}/ejecuciones`),
  ejecucion: (id: string, eid: string) =>
    request<{ ejecucion: EjecucionResumen & { salida: string } }>(`/api/projects/${id}/ejecuciones/${encodeURIComponent(eid)}`),
  terminalDisponible: () => request<TerminalDisponibilidad>('/api/terminal/disponibilidad'),
  terminalListar: (id: string) => request<{ sesiones: TerminalSesion[] }>(`/api/projects/${id}/terminal`),
  terminalAbrir: (id: string, cols: number, rows: number, perfil?: string) =>
    request<{ sesion: TerminalSesion }>(`/api/projects/${id}/terminal`, { method: 'POST', body: JSON.stringify({ cols, rows, perfil }) }),
  terminalLeer: (id: string, sid: string, desde: number) =>
    request<TerminalLectura>(`/api/projects/${id}/terminal/${sid}?desde=${desde}`),
  terminalEscribir: (id: string, sid: string, datos: string) =>
    request<{ sesion: TerminalSesion }>(`/api/projects/${id}/terminal/${sid}/escribir`, { method: 'POST', body: JSON.stringify({ datos }) }),
  terminalTamano: (id: string, sid: string, cols: number, rows: number) =>
    request<{ sesion: TerminalSesion }>(`/api/projects/${id}/terminal/${sid}/tamano`, { method: 'POST', body: JSON.stringify({ cols, rows }) }),
  terminalInterrumpir: (id: string, sid: string) =>
    request<{ sesion: TerminalSesion }>(`/api/projects/${id}/terminal/${sid}/interrumpir`, { method: 'POST' }),
  terminalCerrar: (id: string, sid: string) =>
    request<{ ok: true }>(`/api/projects/${id}/terminal/${sid}`, { method: 'DELETE' }),

  previewEstado: (id: string) => request<EstadoPreview>(`/api/projects/${id}/preview`),
  previewArrancar: (id: string, puerto?: number) =>
    request<EstadoPreview & { url: string }>(`/api/projects/${id}/preview`, { method: 'POST', ...json({ puerto }) }),
  previewRecargar: (id: string) =>
    request<{ ok: true; clientes: number }>(`/api/projects/${id}/preview/recargar`, { method: 'POST' }),
  previewDetener: (id: string) => request<{ ok: true }>(`/api/projects/${id}/preview`, { method: 'DELETE' }),

  lenguajes: (refrescar = false) =>
    request<{ lenguajes: LenguajeDisponible[] }>(`/api/lenguajes${refrescar ? '?refrescar=1' : ''}`),
  planEjecucion: (id: string, path: string) =>
    request<PlanEjecucion>(`/api/projects/${id}/ejecutar/plan?path=${encodeURIComponent(path)}`),
  ejecutarArchivo: (id: string, path: string, sesion?: string | null) =>
    request<{ sesion: TerminalSesion; plan: PlanEjecucion; reutilizada: boolean }>(
      `/api/projects/${id}/ejecutar/archivo`, { method: 'POST', ...json({ path, sesion }) }),

  checks: (id: string) => request<ChecksInfo>(`/api/projects/${id}/checks`),
  runCheck: (id: string, script: string) =>
    request<CheckResult>(`/api/projects/${id}/checks/run`, { method: 'POST', body: JSON.stringify({ script }) }),

  runProcesses: (id: string) => request<{ processes: RunProcess[] }>(`/api/projects/${id}/run/processes`),
  runLogs: (id: string, processId: string, since = 0) =>
    request<{ lines: RunLogLine[]; process: RunProcess }>(
      `/api/projects/${id}/run/processes/${processId}/logs?since=${since}`,
    ),
  runStop: (id: string, processId: string) =>
    request<{ process: RunProcess }>(`/api/projects/${id}/run/processes/${processId}/stop`, { method: 'POST' }),
  probeUrl: (url: string) => request<UrlProbe>(`/api/net/probe?url=${encodeURIComponent(url)}`),

  // busqueda en todo el proyecto
  search: (id: string, opciones: SearchOptions) =>
    request<SearchResults>(`/api/projects/${id}/search`, { method: 'POST', ...json(opciones) }),
  replacePreview: (id: string, opciones: SearchOptions & { replacement: string; paths?: string[] }) =>
    request<ReplaceResult>(`/api/projects/${id}/replace/preview`, { method: 'POST', ...json(opciones) }),
  replaceApply: (id: string, opciones: SearchOptions & { replacement: string; paths?: string[] }) =>
    request<ReplaceResult>(`/api/projects/${id}/replace/apply`, { method: 'POST', ...json(opciones) }),

  // exportar documentacion
  exportDocs: (id: string, format: 'md' | 'html' | 'pdf' | 'docx', bilingue = false) =>
    request<{ filename: string; mime: string; content: string; documented: number }>(
      `/api/projects/${id}/docs/export?format=${format}${bilingue ? '&bilingue=1' : ''}`,
    ),
  glosarioInconsistencias: (id: string) =>
    request<{ inconsistencias: { tipo: string; termino: string; alias?: string; otro?: string; elemento?: string; campo?: string }[] }>(`/api/projects/${id}/glosario/inconsistencias`),
  glosarioImportar: (id: string, desde: string) =>
    request<{ importados: number; omitidos: number }>(`/api/projects/${id}/glosario/importar`, { method: 'POST', ...json({ desde }) }),
  resumen: (id: string, tipo: 'commits' | 'semanal') =>
    request<{ resumen: string; model: string }>(`/api/projects/${id}/resumen`, { method: 'POST', ...json({ tipo }) }),
  comentarPropuesta: (id: string, proposalId: string, texto: string) =>
    request<{ proposals: Proposal[] }>(`/api/projects/${id}/proposals/${encodeURIComponent(proposalId)}/comentarios`, { method: 'POST', ...json({ texto }) }),
  envios: () => request<{ envios: EnvioIA[]; gasto: { usd: number; tokens: number; envios: number; sinPrecio: number } }>('/api/ai/envios'),
  borrarEnvios: () => request<{ ok: true }>('/api/ai/envios', { method: 'DELETE' }),
  comparar: (payload: Record<string, unknown>) =>
    request<{ respuestas: { proveedor: string; answer?: string; model?: string; error?: string }[] }>('/api/ai/comparar', { method: 'POST', ...json(payload) }),
  revisionIA: (id: string, functionId: string, code?: string) =>
    request<{ observaciones: { campo: string; tipo: string; detalle: string }[]; veredicto: string }>(
      `/api/projects/${id}/docs/${encodeURIComponent(functionId)}/revision-ia`, { method: 'POST', ...json({ code }) }),
  marcarRevisada: (id: string, functionId: string) =>
    request<{ approved: Record<string, ApprovedDoc> }>(`/api/projects/${id}/docs/${encodeURIComponent(functionId)}/revisada`, { method: 'POST' }),
  valorar: (id: string, v: { functionId: string; voto: 'bien' | 'mal'; nota?: string }) =>
    request<{ valoraciones: unknown[] }>(`/api/projects/${id}/valoraciones`, { method: 'POST', ...json(v) }),
  traducirDoc: (id: string, functionId: string, idioma: 'es' | 'en') =>
    request<{ doc: FunctionDoc; model: string }>(`/api/projects/${id}/docs/${encodeURIComponent(functionId)}/traduccion`, { method: 'POST', ...json({ idioma }) }),
  guardarTraduccion: (id: string, functionId: string, idioma: 'es' | 'en', doc: FunctionDoc) =>
    request<{ approved: Record<string, ApprovedDoc> }>(`/api/projects/${id}/docs/${encodeURIComponent(functionId)}/traduccion`, { method: 'PUT', ...json({ idioma, doc }) }),
  hostPreview: (html: string) =>
    request<{ id: string; url: string }>('/api/preview', { method: 'POST', ...json({ html }) }),
};

export interface PreviaPull {
  rama: string;
  tuyos: number;
  suyos: number;
  divergido: boolean;
  commits: { hash: string; autor: string; asunto: string }[];
  enAmbos: string[];
  cambiosSinConfirmar: number;
}

export interface StashEntrada { ref: string; cuando: string; mensaje: string }

export interface Conversacion {
  id: string;
  titulo: string;
  creada: string;
  actualizada: string;
  mensajes: { who: 'user' | 'ai'; text: string; model?: string }[];
}

export interface VersionLocal { id: string; en: string; bytes: number; lineas: number }

export interface EjecucionResumen { id: string; etiqueta: string; comando: string; inicio: string; fin: string; ms: number; codigo: number | null; lineas: number }

export interface EnvioIA {
  en: string;
  proveedor: string;
  modelo: string;
  tokens: { entrada: number; salida: number; estimado: boolean };
  usd: number | null;
  mensajes: { role: string; content: string }[];
  respuesta: string;
}
