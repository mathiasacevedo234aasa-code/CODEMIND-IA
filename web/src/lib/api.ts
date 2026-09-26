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
  createProject: (name: string, objective: string, root?: string | null) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', ...json({ name, objective, root }) }),
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
    request<{ ok: boolean; problems: string[]; doc: FunctionDoc | null; model: string }>('/api/ai/document', {
      method: 'POST',
      ...json(payload),
    }),
  chat: (payload: Record<string, unknown>) =>
    request<{ answer: string; model: string }>('/api/ai/chat', { method: 'POST', ...json(payload) }),
  models: (proveedor?: string) =>
    request<{ models: { id: string }[] }>(`/api/ai/models${proveedor ? `?proveedor=${encodeURIComponent(proveedor)}` : ''}`),
  proveedores: () => request<{ proveedores: ProveedorIA[] }>('/api/ai/proveedores'),
  probarIA: (proveedor?: string) =>
    request<PruebaConexion>(`/api/ai/test${proveedor ? `?proveedor=${encodeURIComponent(proveedor)}` : ''}`),

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
  githubPull: (id: string, branch: string) =>
    request<{ output: string; preview: SyncPreview }>(`/api/projects/${id}/github/pull`, {
      method: 'POST',
      ...json({ branch }),
    }),

  // ------------------------------------------------------------ ejecución
  runScripts: (id: string) => request<RunScriptsInfo>(`/api/projects/${id}/run/scripts`),
  runStart: (id: string, payload: { script?: string; command?: string; args?: string[]; label?: string }) =>
    request<{ process: RunProcess }>(`/api/projects/${id}/run/start`, { method: 'POST', ...json(payload) }),
  terminalDisponible: () => request<TerminalDisponibilidad>('/api/terminal/disponibilidad'),
  terminalListar: (id: string) => request<{ sesiones: TerminalSesion[] }>(`/api/projects/${id}/terminal`),
  terminalAbrir: (id: string, cols: number, rows: number) =>
    request<{ sesion: TerminalSesion }>(`/api/projects/${id}/terminal`, { method: 'POST', body: JSON.stringify({ cols, rows }) }),
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
  exportDocs: (id: string, format: 'md' | 'html') =>
    request<{ filename: string; mime: string; content: string; documented: number }>(
      `/api/projects/${id}/docs/export?format=${format}`,
    ),
  hostPreview: (html: string) =>
    request<{ id: string; url: string }>('/api/preview', { method: 'POST', ...json({ html }) }),
};
