import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { ReplaceResult, SearchOptions, SearchResults } from '../lib/types';
import { Icon } from './Icon';

/**
 * Búsqueda y reemplazo en todo el proyecto.
 *
 * El reemplazo va en dos pasos a propósito: primero se ve exactamente cuántas
 * sustituciones habría y en qué archivos, y solo después se escribe. Cambiar
 * decenas de archivos a ciegas es la forma más rápida de romper un proyecto.
 */
/** Expresiones regulares que se usan a menudo. */
const PLANTILLAS_REGEX: [string, string][] = [
  ['TODO / FIXME', '\\b(TODO|FIXME|HACK)\\b'],
  ['console.log', 'console\\.(log|debug)\\('],
  ['Correo electrónico', '[\\w.+-]+@[\\w-]+\\.[\\w.]+'],
  ['URL', 'https?://[^\\s"\'<>)]+'],
  ['Color hexadecimal', '#(?:[0-9a-fA-F]{3}){1,2}\\b'],
  ['Número', '\\b\\d+(?:\\.\\d+)?\\b'],
  ['Fecha AAAA-MM-DD', '\\b\\d{4}-\\d{2}-\\d{2}\\b'],
  ['Dirección IP', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b'],
  ['Línea vacía repetida', '\\n\\s*\\n\\s*\\n'],
  ['Espacios al final', '[ \\t]+$'],
];

export function SearchPanel() {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);
  const openFile = useStore((s) => s.openFile);
  const jumpToLine = useStore((s) => s.jumpToLine);
  const refreshTree = useStore((s) => s.refreshTree);
  const scanProject = useStore((s) => s.scanProject);

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [mostrarReemplazo, setMostrarReemplazo] = useState(false);
  const [opciones, setOpciones] = useState({ regex: false, caseSensitive: false, wholeWord: false });
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [resultados, setResultados] = useState<SearchResults | null>(null);
  const [previa, setPrevia] = useState<ReplaceResult | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  /** Dónde buscar: todo el proyecto, solo lo abierto o solo lo modificado (git). */
  const [alcance, setAlcance] = useState<'todo' | 'abiertos' | 'modificados'>('todo');
  const [hayDeshacer, setHayDeshacer] = useState(false);
  // Historial de búsquedas (en este equipo).
  const [historial, setHistorial] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('codemind.busquedas') ?? '[]'); } catch { return []; } });
  const recordar = (q: string) => setHistorial((h) => {
    const n = [q, ...h.filter((x) => x !== q)].slice(0, 20);
    try { localStorage.setItem('codemind.busquedas', JSON.stringify(n)); } catch { /* sin almacenamiento */ }
    return n;
  });

  const entradaRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { entradaRef.current?.focus(); }, []);

  const construir = (soloRutas?: string[]): SearchOptions => ({ query, ...opciones, include, exclude, ...(soloRutas ? { soloRutas } : {}) });

  /** Las rutas del alcance elegido, o nada si es todo el proyecto. */
  const rutasDelAlcance = async (): Promise<string[] | undefined> => {
    if (alcance === 'abiertos') return Object.keys(useStore.getState().files);
    if (alcance === 'modificados' && project) {
      const st = await api.gitStatus(project.id).catch(() => null);
      return st?.isRepo ? [...st.staged, ...st.unstaged, ...st.untracked].map((c) => c.path) : [];
    }
    return undefined;
  };

  const buscar = async () => {
    if (!project || !query.trim()) return;
    setBuscando(true);
    setPrevia(null);
    recordar(query.trim());
    try {
      setResultados(await api.search(project.id, construir(await rutasDelAlcance())));
    } catch (err) {
      setError((err as Error).message);
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  };

  const calcularReemplazo = async () => {
    if (!project || !query.trim()) return;
    setBuscando(true);
    try {
      setPrevia(await api.replacePreview(project.id, { ...construir(await rutasDelAlcance()), replacement }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const aplicarReemplazo = async () => {
    if (!project || !previa) return;
    const resumen = `Se van a sustituir ${previa.totalReplacements} coincidencia(s) en ${previa.files.length} archivo(s).\n\nModifica tus archivos. Podrás deshacerlo con «Deshacer el reemplazo» mientras no los toques después.\n\n¿Continuar?`;
    if (!window.confirm(resumen)) return;

    setBuscando(true);
    try {
      const res = await api.replaceApply(project.id, { ...construir(await rutasDelAlcance()), replacement });
      setHayDeshacer(true);
      log('sistema', 'info', `Reemplazo aplicado: ${res.totalReplacements} sustitución(es) en ${res.files.length} archivo(s).`);
      setPrevia(null);
      await refreshTree();
      await scanProject();
      await buscar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const alternarPlegado = (path: string) =>
    setPlegados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(path)) siguiente.delete(path);
      else siguiente.add(path);
      return siguiente;
    });

  const irA = async (path: string, line: number) => {
    await openFile(path);
    jumpToLine(path, line);
  };

  if (!project) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn icon sm"
            title={mostrarReemplazo ? 'Ocultar el reemplazo' : 'Mostrar el reemplazo'}
            onClick={() => setMostrarReemplazo((v) => !v)}
          >
            <Icon name={mostrarReemplazo ? 'chevronDown' : 'chevronRight'} size={13} />
          </button>
          <input
            ref={entradaRef}
            type="text"
            placeholder="Buscar en todo el proyecto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
            list="historial-busquedas"
          />
          <datalist id="historial-busquedas">
            {historial.map((h) => <option key={h} value={h} />)}
          </datalist>
        </div>

        {mostrarReemplazo && (
          <div style={{ display: 'flex', gap: 4, paddingLeft: 32 }}>
            <input
              type="text"
              placeholder="Reemplazar por..."
              value={replacement}
              onChange={(e) => { setReplacement(e.target.value); setPrevia(null); }}
            />
            <button className="btn sm outline" disabled={buscando || !query.trim()} onClick={() => void calcularReemplazo()}>
              Calcular
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 32 }}>
          {([
            ['caseSensitive', 'Aa', 'Distinguir mayúsculas'],
            ['wholeWord', 'ab', 'Palabra completa'],
            ['regex', '.*', 'Expresión regular'],
          ] as const).map(([clave, etiqueta, ayuda]) => (
            <button
              key={clave}
              className={`mode-chip ${opciones[clave] ? 'active' : ''}`}
              title={ayuda}
              onClick={() => setOpciones((o) => ({ ...o, [clave]: !o[clave] }))}
            >
              {etiqueta}
            </button>
          ))}
          <button className="btn sm primary" disabled={buscando || !query.trim()} onClick={() => void buscar()}>
            {buscando ? <span className="spinner" /> : <Icon name="search" size={12} />} Buscar
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, paddingLeft: 32 }}>
          <select value={alcance} onChange={(e) => setAlcance(e.target.value as typeof alcance)} title="Dónde buscar">
            <option value="todo">Todo el proyecto</option>
            <option value="abiertos">Solo archivos abiertos</option>
            <option value="modificados">Solo modificados (Git)</option>
          </select>
          <select
            value=""
            title="Plantillas de expresiones regulares"
            onChange={(e) => { if (!e.target.value) return; setQuery(e.target.value); setOpciones((o) => ({ ...o, regex: true })); }}
          >
            <option value="">Plantillas regex…</option>
            {PLANTILLAS_REGEX.map(([nombre, re]) => <option key={nombre} value={re}>{nombre}</option>)}
          </select>
        </div>
        {hayDeshacer && (
          <div style={{ paddingLeft: 32 }}>
            <button
              className="btn sm outline"
              onClick={() => void (async () => {
                try {
                  const r = await api.deshacerReemplazo(project.id);
                  log('sistema', 'info', `Reemplazo deshecho: ${r.restaurados.length} archivo(s) restaurados.`);
                  setHayDeshacer(false);
                  // Lo abierto se vuelve a leer del disco.
                  for (const ruta of r.restaurados) {
                    if (!useStore.getState().files[ruta]) continue;
                    const { content } = await api.readFile(project.id, ruta);
                    useStore.setState((s) => ({ files: { ...s.files, [ruta]: { content, saved: content } } }));
                  }
                  await scanProject();
                  await buscar();
                } catch (err) {
                  setError((err as Error).message);
                }
              })()}
            >
              Deshacer el reemplazo
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, paddingLeft: 32 }}>
          <input type="text" placeholder="Incluir: *.ts, src/**" value={include} onChange={(e) => setInclude(e.target.value)} />
          <input type="text" placeholder="Excluir: *.min.js" value={exclude} onChange={(e) => setExclude(e.target.value)} />
        </div>
      </div>

      {previa && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
          <div className="review-banner" style={{ borderColor: 'var(--warn)' }}>
            <strong>Nada se ha modificado todavía.</strong> Se sustituirían{' '}
            <strong>{previa.totalReplacements}</strong> coincidencia(s) en <strong>{previa.files.length}</strong> archivo(s):
            <div style={{ marginTop: 6, maxHeight: 120, overflow: 'auto' }}>
              {previa.files.map((f) => (
                <div key={f.path} className="hint" style={{ fontFamily: 'var(--mono)' }}>
                  {f.path} — {f.replacements}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn sm danger" disabled={buscando || !previa.totalReplacements} onClick={() => void aplicarReemplazo()}>
                Aplicar el reemplazo
              </button>
              <button className="btn sm outline" onClick={() => setPrevia(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-body">
        {!resultados && !buscando && (
          <p className="hint" style={{ padding: 12 }}>
            Busca texto en todos los archivos del proyecto. Se omiten <code>node_modules</code>, la carpeta{' '}
            <code>.git</code> y los archivos binarios.
          </p>
        )}

        {resultados && resultados.totalMatches === 0 && (
          <p className="hint" style={{ padding: 12 }}>
            Ninguna coincidencia. Se revisaron {resultados.scanned} archivo(s).
          </p>
        )}

        {resultados && resultados.totalMatches > 0 && (
          <>
            <p className="hint" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              {resultados.totalMatches} coincidencia(s) en {resultados.totalFiles} archivo(s)
              {resultados.truncated && ' · lista recortada, afina la búsqueda'}
            </p>
            {resultados.files.map((archivo) => (
              <div key={archivo.path}>
                <div className="git-section-head" onClick={() => alternarPlegado(archivo.path)}>
                  <Icon name={plegados.has(archivo.path) ? 'chevronRight' : 'chevronDown'} size={12} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {archivo.path}
                  </span>
                  <span className="tag muted">{archivo.matches.length}</span>
                </div>
                {!plegados.has(archivo.path) && archivo.matches.map((m, i) => (
                  <div
                    key={`${m.line}-${m.column}-${i}`}
                    className="search-hit"
                    onClick={() => void irA(archivo.path, m.line)}
                    title={`Ir a la línea ${m.line}`}
                  >
                    <span className="search-line">{m.line}</span>
                    <span className="search-preview">
                      {m.preview.slice(0, m.column - 1)}
                      <mark>{m.preview.slice(m.column - 1, m.column - 1 + m.length)}</mark>
                      {m.preview.slice(m.column - 1 + m.length)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
