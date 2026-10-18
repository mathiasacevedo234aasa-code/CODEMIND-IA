import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from '../env.js';
import { HttpError, readJson, writeJson, ensureDataDirs } from './store.js';
import { run, classify, status as gitStatus, LOG_FORMAT, parseLog } from './git.js';

/**
 * Integracion con GitHub mediante un token de acceso personal del usuario.
 *
 * Decision de arquitectura: no se usa OAuth porque exigiria registrar y alojar
 * una aplicacion de GitHub, y CodeMind AI se ejecuta en local. Un token
 * personal es un mecanismo de autenticacion legitimo, lo emite el propio
 * usuario y puede revocarlo cuando quiera.
 *
 * El token no se devuelve nunca por la API, no se escribe en los registros,
 * no se guarda en la URL del remoto y no viaja en los argumentos de la linea
 * de comandos (para eso existe el mecanismo GIT_ASKPASS de mas abajo).
 */

const API = 'https://api.github.com';
const here = path.dirname(fileURLToPath(import.meta.url));
const secretsFile = path.join(DATA_DIR, 'secrets.json');

// --------------------------------------------------------------- el token

export async function getToken() {
  const stored = await readJson(secretsFile, null);
  return stored?.githubToken || null;
}

async function storeToken(token) {
  await ensureDataDirs();
  const stored = (await readJson(secretsFile, null)) ?? {};
  // Se conserva el resto del archivo: aqui tambien vive la clave de Groq.
  await writeJson(secretsFile, { ...stored, githubToken: token });
  try {
    await fs.chmod(secretsFile, 0o600);
  } catch {
    /* sin efecto real en Windows */
  }
}

export async function clearToken() {
  const stored = (await readJson(secretsFile, null)) ?? {};
  delete stored.githubToken;
  await writeJson(secretsFile, stored);
}

/** Ultimo cortafuegos: si el token se colara en un texto, no sale de aqui. */
function redact(text, token) {
  if (!text) return '';
  return token ? text.split(token).join('***') : text;
}

async function ghFetch(pathname, token, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CodeMind-AI',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new HttpError(502, `No se pudo contactar con GitHub: ${err.message}`);
  }
  if (res.status === 401) throw new HttpError(401, 'GitHub rechazo el token. Puede haber caducado o haber sido revocado.');
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new HttpError(403, remaining === '0'
      ? 'GitHub aplico un limite de peticiones. Espera unos minutos.'
      : 'GitHub denego el acceso. El token no tiene permisos suficientes para esta operacion.');
  }
  if (res.status === 404) throw new HttpError(404, 'GitHub no encuentra ese recurso o el token no tiene acceso a el.');
  if (!res.ok) throw new HttpError(502, `GitHub devolvio ${res.status}.`);
  return res;
}

export async function setToken(token) {
  const clean = String(token ?? '').trim();
  if (!/^(ghp_|github_pat_|gho_|ghs_)/.test(clean) || clean.length < 20) {
    throw new HttpError(400, 'Eso no parece un token de GitHub. Deben empezar por "ghp_" o "github_pat_".');
  }
  // Solo se guarda un token que de verdad funciona.
  await ghFetch('/user', clean);
  await storeToken(clean);
}

export async function status() {
  const token = await getToken();
  if (!token) return { configured: false, user: null, scopes: [] };
  try {
    const res = await ghFetch('/user', token);
    const user = await res.json();
    const scopes = (res.headers.get('x-oauth-scopes') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      configured: true,
      scopes,
      user: {
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatar_url ?? null,
        htmlUrl: user.html_url,
      },
    };
  } catch (err) {
    return { configured: true, user: null, scopes: [], error: err.message };
  }
}

const mapRepo = (r) => ({
  fullName: r.full_name,
  name: r.name,
  owner: r.owner?.login ?? '',
  private: Boolean(r.private),
  defaultBranch: r.default_branch ?? 'main',
  htmlUrl: r.html_url,
  cloneUrl: r.clone_url,
  canPush: Boolean(r.permissions?.push),
  updatedAt: r.updated_at ?? r.pushed_at ?? '',
});

export async function repos(query = '') {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'No hay ningun token de GitHub configurado.');

  const all = [];
  for (let page = 1; page <= 3; page++) {
    const res = await ghFetch(
      `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`,
      token,
    );
    const batch = await res.json();
    all.push(...batch.map(mapRepo));
    if (batch.length < 100) break;
  }

  const q = query.trim().toLowerCase();
  return q ? all.filter((r) => r.fullName.toLowerCase().includes(q)) : all;
}

// ------------------------------------------------------------- askpass

/**
 * git no puede ejecutar un .cjs directamente, asi que se genera un lanzador
 * nativo. Se crea una sola vez y se reescribe solo si su contenido cambia.
 */
async function ensureAskpass() {
  await ensureDataDirs();
  const script = path.join(here, '..', 'git-askpass.cjs');
  const isWindows = process.platform === 'win32';
  const launcher = path.join(DATA_DIR, isWindows ? 'askpass.cmd' : 'askpass.sh');
  const content = isWindows
    ? `@echo off\r\nnode "${script}" %*\r\n`
    : `#!/bin/sh\nexec node "${script}" "$@"\n`;

  const existing = await fs.readFile(launcher, 'utf8').catch(() => null);
  if (existing !== content) {
    await fs.writeFile(launcher, content, 'utf8');
    if (!isWindows) await fs.chmod(launcher, 0o700);
  }
  return launcher;
}

/** Entorno para las operaciones de red de git, con el token fuera de argv. */
async function authEnv(token) {
  return { GIT_ASKPASS: await ensureAskpass(), CODEMIND_GH_TOKEN: token, GIT_TERMINAL_PROMPT: '0' };
}

async function requireRepo(cwd) {
  const inside = await run(cwd, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true });
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    throw new HttpError(400, 'Este proyecto todavia no es un repositorio git. Inicializalo desde el panel de control de versiones antes de vincularlo con GitHub.');
  }
}

// --------------------------------------------------------- vinculacion

export async function link(cwd, fullName) {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta primero tu cuenta de GitHub.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(fullName ?? ''))) {
    throw new HttpError(400, 'El repositorio debe indicarse como "propietario/nombre".');
  }
  await requireRepo(cwd);

  const res = await ghFetch(`/repos/${fullName}`, token);
  const repo = mapRepo(await res.json());
  const url = `https://github.com/${repo.fullName}.git`; // URL limpia: sin token

  const existing = await run(cwd, ['remote', 'get-url', 'origin'], { allowFailure: true });
  let replaced = null;
  if (existing.code === 0) {
    replaced = existing.stdout.trim();
    await run(cwd, ['remote', 'set-url', 'origin', url]);
  } else {
    await run(cwd, ['remote', 'add', 'origin', url]);
  }
  return { remote: 'origin', url, replaced, canPush: repo.canPush };
}

export async function unlink(cwd) {
  await run(cwd, ['remote', 'remove', 'origin'], { allowFailure: true });
}

// ------------------------------------------------ vista previa y sincronia

const CHANGE_WORDS = { A: 'anadido', M: 'modificado', D: 'eliminado', R: 'modificado', C: 'anadido', T: 'modificado' };

export async function preview(cwd) {
  const token = await getToken();
  const warnings = [];

  const remoteUrlRes = await run(cwd, ['remote', 'get-url', 'origin'], { allowFailure: true });
  const linked = remoteUrlRes.code === 0;
  const remoteUrl = linked ? remoteUrlRes.stdout.trim() : null;

  const base = {
    linked,
    remote: linked ? 'origin' : null,
    remoteUrl,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    commitsToPush: [],
    filesToPush: [],
    uncommitted: 0,
    conflicts: [],
    warnings,
    canPush: false,
  };

  if (!linked) {
    warnings.push('Este proyecto no esta vinculado con ningun repositorio de GitHub.');
    return base;
  }
  if (!token) {
    warnings.push('No hay ningun token de GitHub configurado, asi que no se puede consultar ni subir.');
  }

  // Un fetch da datos reales sobre el remoto. Si falla, se dice y se sigue
  // con la informacion local en lugar de inventarse el estado.
  if (token) {
    const fetched = await run(cwd, ['fetch', 'origin'], { allowFailure: true, env: await authEnv(token), timeout: 120000 });
    if (fetched.code !== 0) {
      warnings.push(`No se pudo consultar el remoto: ${redact((fetched.stderr || '').trim().split('\n')[0], token)}`);
    }
  }

  const st = await gitStatus(cwd);
  base.branch = st.branch;
  base.upstream = st.upstream;
  base.ahead = st.ahead;
  base.behind = st.behind;
  base.uncommitted = st.staged.length + st.unstaged.length + st.untracked.length;
  base.conflicts = st.conflicts.map((c) => c.path);

  const range = st.upstream ? `${st.upstream}..HEAD` : 'HEAD';
  const logRes = await run(cwd, ['log', '-50', `--pretty=format:${LOG_FORMAT}`, range], { allowFailure: true });
  if (logRes.code === 0) base.commitsToPush = parseLog(logRes.stdout);

  if (base.commitsToPush.length) {
    const diffArgs = st.upstream
      ? ['diff', '--name-status', `${st.upstream}..HEAD`]
      : ['show', '--name-status', '--pretty=format:', base.commitsToPush[base.commitsToPush.length - 1].hash];
    const files = await run(cwd, diffArgs, { allowFailure: true });
    const seen = new Set();
    for (const line of files.stdout.split('\n')) {
      const match = /^([A-Z])\d*\s+(.+)$/.exec(line.trim());
      if (!match) continue;
      const filePath = match[2].split('\t').pop().replace(/\\/g, '/');
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      base.filesToPush.push({
        path: filePath,
        change: CHANGE_WORDS[match[1]] ?? 'modificado',
        kind: classify(filePath),
      });
    }
  }

  if (base.uncommitted > 0) {
    warnings.push(`Hay ${base.uncommitted} archivo(s) con cambios sin confirmar. No se subiran: solo viajan los commits.`);
  }
  if (base.behind > 0) {
    warnings.push(`El remoto tiene ${base.behind} commit(s) que tu no tienes. Trae los cambios antes de subir.`);
  }
  if (base.conflicts.length) warnings.push('Hay conflictos sin resolver. Resuelvelos antes de sincronizar.');

  let canPush = Boolean(token) && base.conflicts.length === 0;
  if (canPush && remoteUrl) {
    const match = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remoteUrl);
    if (match) {
      try {
        const res = await ghFetch(`/repos/${match[1]}`, token);
        const repo = mapRepo(await res.json());
        if (!repo.canPush) {
          canPush = false;
          warnings.push(`Tu token no tiene permiso de escritura en ${repo.fullName}.`);
        }
      } catch (err) {
        canPush = false;
        warnings.push(`No se pudo comprobar el permiso de escritura: ${err.message}`);
      }
    }
  }
  if (!base.commitsToPush.length) warnings.push('No hay ningun commit pendiente de subir.');

  base.canPush = canPush;
  return base;
}

export async function push(cwd, branch, setUpstream) {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta tu cuenta de GitHub antes de subir cambios.');
  await requireRepo(cwd);
  const name = String(branch ?? '').trim();
  if (!name || name.startsWith('-')) throw new HttpError(400, 'Falta la rama de destino.');

  const args = ['push'];
  if (setUpstream) args.push('-u');
  args.push('origin', name); // jamas --force: no se reescribe el historial remoto

  const res = await run(cwd, args, { allowFailure: true, env: await authEnv(token), timeout: 180000 });
  const output = redact(`${res.stdout}\n${res.stderr}`.trim(), token);

  if (res.code !== 0) {
    if (/non-fast-forward|rejected/i.test(output)) {
      throw new HttpError(409, 'GitHub rechazo la subida porque el remoto tiene commits que tu no tienes. Trae los cambios primero y vuelve a intentarlo.');
    }
    if (/403|permission|denied/i.test(output)) {
      throw new HttpError(403, 'GitHub denego la subida: el token no tiene permiso de escritura en ese repositorio.');
    }
    throw new HttpError(502, `No se pudo subir: ${output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
  }
  return { output, preview: await preview(cwd) };
}

export async function pull(cwd, branch) {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta tu cuenta de GitHub antes de traer cambios.');
  await requireRepo(cwd);
  const name = String(branch ?? '').trim();
  if (!name || name.startsWith('-')) throw new HttpError(400, 'Falta la rama de origen.');

  // Solo avance rapido: una fusion o un rebase automatico podria mezclar el
  // trabajo del usuario sin que el lo haya decidido.
  const res = await run(cwd, ['pull', '--ff-only', 'origin', name], {
    allowFailure: true,
    env: await authEnv(token),
    timeout: 180000,
  });
  const output = redact(`${res.stdout}\n${res.stderr}`.trim(), token);

  if (res.code !== 0) {
    if (/not possible to fast-forward|diverging|divergent/i.test(output)) {
      throw new HttpError(409, 'Tu rama y la del remoto han divergido. CodeMind AI no fusiona por su cuenta: resuelvelo desde git antes de continuar.');
    }
    throw new HttpError(502, `No se pudieron traer los cambios: ${output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
  }
  return { output, preview: await preview(cwd) };
}



/**
 * Que pasaria al traer los cambios, sin traerlos todavia.
 *
 * Igual que antes de subir se enseña que viaja, antes de fusionar o
 * reorganizar se enseña que llega y que archivos han cambiado en los dos
 * lados, que es donde puede haber conflictos. `git fetch` no toca tu rama ni
 * tus archivos: solo actualiza lo que se sabe del remoto.
 */
export async function previaPull(cwd, branch) {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta tu cuenta de GitHub antes de traer cambios.');
  await requireRepo(cwd);
  const name = String(branch ?? '').trim();
  if (!name || name.startsWith('-')) throw new HttpError(400, 'Falta la rama de origen.');

  const fetch = await run(cwd, ['fetch', 'origin', name], { allowFailure: true, env: await authEnv(token), timeout: 120000 });
  if (fetch.code !== 0) {
    throw new HttpError(502, `No se pudo consultar el remoto: ${redact(fetch.stderr, token).split('\n').filter(Boolean).slice(-1)[0] ?? ''}`);
  }

  const remota = `origin/${name}`;
  const cuenta = await run(cwd, ['rev-list', '--left-right', '--count', `HEAD...${remota}`], { allowFailure: true });
  const [tuyos, suyos] = cuenta.stdout.trim().split(/\s+/).map(Number);

  const entrantes = await run(cwd, ['log', '--format=%h%x1f%an%x1f%s', `HEAD..${remota}`, '-n', '30'], { allowFailure: true });
  const commits = entrantes.stdout.split('\n').filter(Boolean).map((l) => {
    const [hash, autor, asunto] = l.split('\x1f');
    return { hash, autor, asunto };
  });

  // Archivos tocados en los dos lados desde que divergieron: los candidatos
  // a conflicto. No es una prediccion exacta, pero es justo donde mirar.
  const base = (await run(cwd, ['merge-base', 'HEAD', remota], { allowFailure: true })).stdout.trim();
  let enAmbos = [];
  if (base) {
    const nuestros = (await run(cwd, ['diff', '--name-only', base, 'HEAD'], { allowFailure: true })).stdout.split('\n').filter(Boolean);
    const suyosArch = new Set((await run(cwd, ['diff', '--name-only', base, remota], { allowFailure: true })).stdout.split('\n').filter(Boolean));
    enAmbos = nuestros.filter((f) => suyosArch.has(f));
  }

  const estado = await run(cwd, ['status', '--porcelain'], { allowFailure: true });
  const sucio = estado.stdout.split('\n').filter(Boolean).length;

  return {
    rama: name,
    tuyos: tuyos || 0,
    suyos: suyos || 0,
    divergido: (tuyos || 0) > 0 && (suyos || 0) > 0,
    commits,
    enAmbos,
    cambiosSinConfirmar: sucio,
  };
}

/**
 * Traer cambios eligiendo como juntarlos.
 *
 * - 'ff': solo avanzar. Si han divergido, se para (lo de siempre).
 * - 'merge': un commit de fusion que junta las dos historias.
 * - 'rebase': tus commits se reaplican encima de los del remoto.
 *
 * Nunca con cambios sin confirmar: mezclar una fusion con trabajo a medias es
 * la forma mas facil de perder algo. Y si aparecen conflictos, se para y se
 * dice cuales; deshacer la operacion queda a un boton (abortarPull).
 */
export async function pullCon(cwd, branch, modo = 'ff') {
  if (!['ff', 'merge', 'rebase'].includes(modo)) throw new HttpError(400, 'Modo de traer cambios no valido.');
  if (modo === 'ff') return pull(cwd, branch);

  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta tu cuenta de GitHub antes de traer cambios.');
  await requireRepo(cwd);
  const name = String(branch ?? '').trim();
  if (!name || name.startsWith('-')) throw new HttpError(400, 'Falta la rama de origen.');

  const estado = await run(cwd, ['status', '--porcelain'], { allowFailure: true });
  if (estado.stdout.trim()) {
    throw new HttpError(409, 'Tienes cambios sin confirmar. Confirmalos o guardalos en un stash antes de fusionar: asi nada de tu trabajo a medias se mezcla con lo que llega.');
  }

  const args = modo === 'rebase'
    ? ['pull', '--rebase', 'origin', name]
    : ['pull', '--no-rebase', '--no-edit', 'origin', name];
  const res = await run(cwd, args, { allowFailure: true, env: await authEnv(token), timeout: 180000 });
  const output = redact(`${res.stdout}\n${res.stderr}`.trim(), token);

  if (res.code !== 0) {
    const conflictos = (await run(cwd, ['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }))
      .stdout.split('\n').filter(Boolean);
    if (conflictos.length) {
      throw new HttpError(409, `Hay conflictos en ${conflictos.length} archivo(s): ${conflictos.join(', ')}. Resuelvelos y confirma, o pulsa "Deshacer" para volver a como estabas.`);
    }
    throw new HttpError(502, `No se pudieron traer los cambios: ${output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
  }
  return { output, preview: await preview(cwd) };
}

/** Vuelve a como estaba todo antes de una fusion o rebase con conflictos. */
export async function abortarPull(cwd) {
  await requireRepo(cwd);
  const gitDir = (await run(cwd, ['rev-parse', '--git-dir'])).stdout.trim();
  const abs = path.isAbsolute(gitDir) ? gitDir : path.join(cwd, gitDir);
  const existe = async (p) => fs.access(path.join(abs, p)).then(() => true).catch(() => false);

  if (await existe('rebase-merge') || await existe('rebase-apply')) {
    await run(cwd, ['rebase', '--abort']);
    return { deshecho: 'rebase' };
  }
  if (await existe('MERGE_HEAD')) {
    await run(cwd, ['merge', '--abort']);
    return { deshecho: 'fusion' };
  }
  throw new HttpError(409, 'No hay ninguna fusion ni rebase a medias que deshacer.');
}

/** Sube una etiqueta (version) a GitHub. Nunca con --force. */
export async function pushEtiqueta(cwd, nombre) {
  const token = await getToken();
  if (!token) throw new HttpError(400, 'Conecta tu cuenta de GitHub antes de subir etiquetas.');
  await requireRepo(cwd);
  const n = String(nombre ?? '').trim();
  if (!/^[\w][\w.\-/]{0,99}$/.test(n)) throw new HttpError(400, 'Nombre de etiqueta no valido.');
  const res = await run(cwd, ['push', 'origin', `refs/tags/${n}`], { allowFailure: true, env: await authEnv(token), timeout: 120000 });
  const output = redact(`${res.stdout}\n${res.stderr}`.trim(), token);
  if (res.code !== 0) {
    if (/already exists|rejected/i.test(output)) throw new HttpError(409, `En GitHub ya hay una etiqueta "${n}" distinta. No se sobrescribe.`);
    throw new HttpError(502, `No se pudo subir la etiqueta: ${output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
  }
  return { output };
}
