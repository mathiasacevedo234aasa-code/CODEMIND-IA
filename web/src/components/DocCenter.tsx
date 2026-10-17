import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { ApprovedDoc, ProjectMemory } from '../lib/types';
import { DocView } from './DocView';
import { Icon } from './Icon';
import { ProjectMap } from './ProjectMap';
import { GlosarioPanel } from './GlosarioPanel';

type Section = 'general' | 'arquitectura' | 'glosario' | 'funciones' | 'decisiones' | 'progreso' | 'historial';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'Descripcion general' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'glosario', label: 'Glosario' },
  { id: 'funciones', label: 'Documentacion de funciones' },
  { id: 'decisiones', label: 'Registro de decisiones' },
  { id: 'progreso', label: 'Registro de progreso' },
  { id: 'historial', label: 'Historial' },
];

const OVERVIEW_FIELDS: { key: keyof ProjectMemory['overview']; label: string }[] = [
  { key: 'objective', label: 'Objetivo principal' },
  { key: 'problem', label: 'Problema que intenta resolver' },
  { key: 'audience', label: 'Usuarios a los que esta dirigido' },
  { key: 'technologies', label: 'Tecnologias utilizadas' },
  { key: 'status', label: 'Estado actual del desarrollo' },
  { key: 'implemented', label: 'Funcionalidades implementadas' },
  { key: 'pending', label: 'Funcionalidades pendientes' },
];

/**
 * Descarga la documentación aprobada como un documento entregable.
 *
 * Solo sale lo aprobado: una propuesta pendiente no es documentación oficial
 * y no debe acabar en algo que se entrega o se publica.
 */
function ExportarDocumentacion() {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const log = useStore((s) => s.log);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const exportar = async (formato: 'md' | 'html' | 'pdf' | 'docx') => {
    if (!project) return;
    setOcupado(formato);
    try {
      const res = await api.exportDocs(project.id, formato);
      if (!res.documented) {
        setError('Todavía no hay ningún elemento con documentación aprobada que exportar.');
        return;
      }
      // Descarga local: el archivo no pasa por ningún servidor externo.
      // PDF y Word llegan en base64: hay que convertirlos a bytes de verdad.
      const datos = (res as { binario?: boolean }).binario
        ? Uint8Array.from(atob(res.content), (c) => c.charCodeAt(0))
        : res.content;
      const url = URL.createObjectURL(new Blob([datos], { type: res.mime }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = res.filename;
      enlace.click();
      URL.revokeObjectURL(url);
      log('documentacion', 'info', `Documentación exportada: ${res.filename} (${res.documented} elemento(s)).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <span style={{ display: 'flex', gap: 6 }}>
      <button className="btn sm outline" disabled={Boolean(ocupado)} onClick={() => void exportar('md')} title="Descargar en Markdown">
        {ocupado === 'md' ? <span className="spinner" /> : <Icon name="docs" size={13} />} Markdown
      </button>
      <button className="btn sm outline" disabled={Boolean(ocupado)} onClick={() => void exportar('html')} title="Descargar como página web, lista para imprimir">
        {ocupado === 'html' ? <span className="spinner" /> : <Icon name="file" size={13} />} HTML
      </button>
      <button className="btn sm outline" disabled={Boolean(ocupado)} onClick={() => void exportar('pdf')} title="Descargar en PDF, para entregar o imprimir">
        {ocupado === 'pdf' ? <span className="spinner" /> : <Icon name="file" size={13} />} PDF
      </button>
      <button className="btn sm outline" disabled={Boolean(ocupado)} onClick={() => void exportar('docx')} title="Descargar como documento de Word (.docx)">
        {ocupado === 'docx' ? <span className="spinner" /> : <Icon name="docs" size={13} />} Word
      </button>
    </span>
  );
}

function GeneralSection() {
  const memory = useStore((s) => s.memory);
  const saveMemory = useStore((s) => s.saveMemory);
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const [draft, setDraft] = useState(memory?.overview);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => setDraft(memory?.overview), [memory]);
  if (!draft) return null;

  const askDraft = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const res = await api.chat({
        projectId: project.id,
        mode: 'context',
        question:
          'Redacta un borrador breve de la descripcion general del proyecto a partir de lo que consta en la memoria, ' +
          'las funciones documentadas y el objetivo declarado. Indica explicitamente que campos no constan en lugar de inventarlos.',
      });
      setSuggestion(res.answer);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="hint" style={{ marginBottom: 14 }}>
        Esta informacion alimenta la memoria del proyecto y el modo "Contexto" del asistente. Solo se guarda lo que tu apruebes.
      </p>
      <div className="grid2">
        {OVERVIEW_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <textarea value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => void saveMemory({ overview: draft })}>
          <Icon name="check" size={13} /> Guardar descripcion
        </button>
        <button className="btn outline" onClick={() => void askDraft()} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="brain" size={13} />} Pedir borrador a la IA
        </button>
      </div>
      {suggestion && (
        <div className="card" style={{ marginTop: 14 }}>
          <h4>Borrador propuesto por la IA (no guardado)</h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{suggestion}</p>
          <p className="hint">Copia manualmente lo que consideres correcto a los campos de arriba y pulsa Guardar.</p>
          <button className="btn sm outline" onClick={() => setSuggestion(null)}>Descartar borrador</button>
        </div>
      )}
    </>
  );
}

function ArchitectureSection() {
  const memory = useStore((s) => s.memory);
  const tree = useStore((s) => s.tree);
  const analysis = useStore((s) => s.analysis);
  const saveMemory = useStore((s) => s.saveMemory);
  const [notes, setNotes] = useState(memory?.architectureNotes ?? '');

  useEffect(() => setNotes(memory?.architectureNotes ?? ''), [memory]);

  const rows = Object.entries(analysis).map(([path, a]) => ({
    path,
    symbols: a.symbols.length,
    classes: a.classes,
    imports: a.imports,
  }));

  const countFiles = (nodes: typeof tree): number =>
    nodes.reduce((acc, n) => acc + (n.type === 'dir' ? countFiles(n.children) : 1), 0);

  return (
    <>
      <ProjectMap />

      <h4 style={{ margin: '20px 0 8px' }}>Archivos analizados</h4>
      <div className="card">
        <h4>Estructura</h4>
        <p className="meta">{countFiles(tree)} archivo(s) en el proyecto · {rows.length} archivo(s) analizados</p>
      </div>
      {rows.map((r) => (
        <div className="card" key={r.path}>
          <h4 style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{r.path}</h4>
          <p className="meta">
            {r.symbols} elemento(s){r.classes.length ? ` · clases: ${r.classes.join(', ')}` : ''}
          </p>
          {r.imports.length > 0 && (
            <p className="meta">Depende de (confirmado por import): {r.imports.join(', ')}</p>
          )}
        </div>
      ))}
      <div className="field" style={{ marginTop: 14 }}>
        <label>Notas de arquitectura y flujo general</label>
        <textarea style={{ minHeight: 140 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn primary" onClick={() => void saveMemory({ architectureNotes: notes })}>
        <Icon name="check" size={13} /> Guardar notas
      </button>
    </>
  );
}

function FunctionsSection() {
  const approved = useStore((s) => s.approved);
  const deleteDoc = useStore((s) => s.deleteDoc);
  const goToSymbol = useStore((s) => s.goToSymbol);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const statusOf = useStore((s) => s.statusOf);
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('');
  const [estado, setEstado] = useState<'' | 'aldia' | 'revisar' | 'huerfana'>('');
  const [termino, setTermino] = useState('');
  const [glosario, setGlosario] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const project = useStore((s) => s.project);

  useEffect(() => {
    if (!project) return;
    api.glosario(project.id).then((g) => setGlosario(g.terminos.map((t) => t.termino))).catch(() => {});
  }, [project]);

  const live = useMemo(() => symbolsFn(), [symbolsFn, analysis]);
  const docs = Object.values(approved);
  const files = [...new Set(docs.map((d) => d.filePath))].sort();

  /**
   * Se busca DENTRO de la documentación, no solo en el nombre: propósito,
   * explicación, parámetros, observaciones. Es lo que permite encontrar
   * "¿dónde se calculaba el IVA?" sin saber cómo se llama la función.
   */
  const textoDe = (d: ApprovedDoc) => [
    d.name, d.filePath, d.doc.proposito, d.doc.explicacion, d.doc.observaciones,
    ...(d.doc.parametros ?? []).map((p) => `${p.nombre} ${p.descripcion}`),
    ...(d.doc.flujo ?? []),
  ].join(' ').toLowerCase();

  const estadoDe = (d: ApprovedDoc) => {
    const fn = live.find((f) => f.id === d.functionId);
    if (!fn) return 'huerfana';
    return statusOf(fn) === 'revisar' ? 'revisar' : 'aldia';
  };

  const visible = docs.filter((d) => {
    const texto = textoDe(d);
    return (!query || texto.includes(query.toLowerCase()))
      && (!termino || texto.includes(termino.toLowerCase()))
      && (!file || d.filePath === file)
      && (!estado || estadoDe(d) === estado);
  });

  if (!docs.length) {
    return <p className="hint">Todavia no hay funciones con documentacion aprobada.</p>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Buscar en el texto de la documentación..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} style={{ width: 'auto' }}>
          <option value="">Cualquier estado</option>
          <option value="aldia">Al día</option>
          <option value="revisar">Por revisar</option>
          <option value="huerfana">Su código ya no existe</option>
        </select>
        {glosario.length > 0 && (
          <select value={termino} onChange={(e) => setTermino(e.target.value)} style={{ width: 'auto' }} title="Solo lo que menciona este término del glosario">
            <option value="">Cualquier término</option>
            {glosario.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select value={file} onChange={(e) => setFile(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los archivos</option>
          {files.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <p className="hint" style={{ marginBottom: 8 }}>{visible.length} de {docs.length} documentados</p>
      {visible.map((d: ApprovedDoc) => {
        const fn = live.find((f) => f.id === d.functionId);
        const status = fn ? statusOf(fn) : null;
        return (
          <div className="card" key={d.functionId}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h4 style={{ fontFamily: 'var(--mono)', margin: 0 }}>{d.name}</h4>
              <span className="tag">{d.filePath}</span>
              {status === 'revisar' && <span className="tag warn">Revisar documentacion</span>}
              {status === 'documentada' && <span className="tag ok">Al dia</span>}
              {!fn && <span className="tag muted">La funcion ya no aparece en el codigo</span>}
              <span style={{ flex: 1 }} />
              <button className="btn sm outline" onClick={() => setOpen(open === d.functionId ? null : d.functionId)}>
                {open === d.functionId ? 'Ocultar' : 'Ver documentacion'}
              </button>
              {fn && <button className="btn sm outline" onClick={() => void goToSymbol(fn)}>Ir al codigo</button>}
              <button
                className="btn sm danger"
                onClick={() => {
                  if (window.confirm(`Retirar la documentacion oficial de ${d.name}? Se conservara en el historial.`)) {
                    void deleteDoc(d.functionId);
                  }
                }}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
            <p className="meta" style={{ marginTop: 6 }}>
              Aprobada el {new Date(d.approvedAt).toLocaleString('es')}
              {d.model ? ` · modelo ${d.model}` : ''}
              {d.edited ? ' · editada manualmente' : ''}
            </p>
            {open === d.functionId && <div style={{ marginTop: 10 }}><DocView doc={d.doc} kind={d.kind} /></div>}
          </div>
        );
      })}
    </>
  );
}

function DecisionsSection() {
  const memory = useStore((s) => s.memory);
  const addDecision = useStore((s) => s.addDecision);
  const removeDecision = useStore((s) => s.removeDecision);
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');

  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>
        Registra decisiones que tomaste tu. La IA puede ayudarte a organizarlas, pero no inventa decisiones que no consten aqui.
      </p>
      <div className="field">
        <label>Decision</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Por ejemplo: usar localStorage en lugar de una base de datos" />
      </div>
      <div className="field">
        <label>Motivo</label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </div>
      <button
        className="btn primary"
        disabled={!title.trim()}
        onClick={() => { void addDecision(title, rationale); setTitle(''); setRationale(''); }}
      >
        <Icon name="plus" size={13} /> Anadir decision
      </button>

      <div style={{ marginTop: 18 }}>
        {(memory?.decisions ?? []).map((d) => (
          <div className="card" key={d.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h4>{d.title}</h4>
                {d.rationale && <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{d.rationale}</p>}
                <p className="meta">{new Date(d.createdAt).toLocaleString('es')}</p>
              </div>
              <button className="btn sm danger" onClick={() => void removeDecision(d.id)}><Icon name="trash" size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProgressSection() {
  const memory = useStore((s) => s.memory);
  const addProgress = useStore((s) => s.addProgress);
  const updateProgress = useStore((s) => s.updateProgress);
  const removeProgress = useStore((s) => s.removeProgress);
  const approved = useStore((s) => s.approved);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const statusOf = useStore((s) => s.statusOf);

  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState('pendiente');

  const live = useMemo(() => symbolsFn(), [symbolsFn, analysis]);
  const undocumented = live.filter((f) => statusOf(f) === 'sin-documentar');
  const stale = live.filter((f) => statusOf(f) === 'revisar');

  return (
    <>
      <div className="card">
        <h4>Estado de la documentacion (calculado del codigo actual)</h4>
        <p className="meta">
          {live.length} funcion(es) detectadas · {Object.keys(approved).length} con documentacion aprobada ·{' '}
          {undocumented.length} sin documentar · {stale.length} pendientes de revisar
        </p>
        {stale.length > 0 && (
          <p className="meta" style={{ color: 'var(--warn)' }}>
            Cambiaron desde su ultima documentacion: {stale.map((f) => f.qualifiedName).join(', ')}
          </p>
        )}
      </div>

      <div className="field">
        <label>Entrada de progreso</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Que se desarrollo, esta en curso o falta" />
      </div>
      <div className="field">
        <label>Detalle</label>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="field">
        <label>Estado</label>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="pendiente">Pendiente</option>
          <option value="en progreso">En progreso</option>
          <option value="hecho">Hecho</option>
        </select>
      </div>
      <button
        className="btn primary"
        disabled={!title.trim()}
        onClick={() => { void addProgress(title, detail, state); setTitle(''); setDetail(''); }}
      >
        <Icon name="plus" size={13} /> Anadir entrada
      </button>

      <div style={{ marginTop: 18 }}>
        {(memory?.progress ?? []).map((p) => (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h4>{p.title}</h4>
                {p.detail && <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{p.detail}</p>}
                <p className="meta">{new Date(p.createdAt).toLocaleString('es')}</p>
              </div>
              <select
                value={p.state}
                style={{ width: 'auto' }}
                onChange={(e) => void updateProgress(p.id, { state: e.target.value })}
              >
                <option value="pendiente">Pendiente</option>
                <option value="en progreso">En progreso</option>
                <option value="hecho">Hecho</option>
              </select>
              <button className="btn sm danger" onClick={() => void removeProgress(p.id)}><Icon name="trash" size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function HistorySection() {
  const project = useStore((s) => s.project);
  const approved = useStore((s) => s.approved);
  const [versions, setVersions] = useState<ApprovedDoc[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [comparando, setComparando] = useState<string | null>(null);

  useEffect(() => {
    if (project) void api.history(project.id).then((r) => setVersions(r.versions));
  }, [project]);

  if (!versions.length) return <p className="hint">Todavia no hay versiones anteriores. Aqui se conservan las documentaciones sustituidas o retiradas.</p>;

  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>
        Cada aprobacion conserva la version anterior. Nada se sobrescribe sin dejar rastro.
      </p>
      {versions.map((v) => (
        <div className="card" key={v.versionId}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h4 style={{ fontFamily: 'var(--mono)', margin: 0 }}>{v.name}</h4>
            <span className="tag">{v.filePath}</span>
            <span className="tag muted">huella {v.codeHash?.slice(0, 8) ?? 'n/d'}</span>
            <span style={{ flex: 1 }} />
            <button className="btn sm outline" onClick={() => setOpen(open === v.versionId ? null : v.versionId)}>
              {open === v.versionId ? 'Ocultar' : 'Ver version'}
            </button>
          </div>
          <p className="meta" style={{ marginTop: 6 }}>Aprobada el {new Date(v.approvedAt).toLocaleString('es')}</p>

          {approved[v.functionId] && (
            <button
              className="btn sm outline"
              style={{ marginTop: 6 }}
              onClick={() => setComparando(comparando === v.versionId ? null : v.versionId)}
            >
              {comparando === v.versionId ? 'Ocultar comparación' : 'Comparar con la versión actual'}
            </button>
          )}

          {comparando === v.versionId && approved[v.functionId] && (
            <div className="comparacion">
              <div>
                <span className="panel-title">Esta versión · {new Date(v.approvedAt).toLocaleDateString('es')}</span>
                <DocView doc={v.doc} kind={v.kind} />
                {v.code && <div className="doc-section"><h4>Código de entonces</h4><pre>{v.code}</pre></div>}
              </div>
              <div>
                <span className="panel-title">
                  Versión actual · {new Date(approved[v.functionId].approvedAt).toLocaleDateString('es')}
                </span>
                <DocView doc={approved[v.functionId].doc} kind={approved[v.functionId].kind} />
                {approved[v.functionId].code && (
                  <div className="doc-section"><h4>Código actual</h4><pre>{approved[v.functionId].code}</pre></div>
                )}
              </div>
            </div>
          )}

          {open === v.versionId && (
            <div style={{ marginTop: 10 }}>
              <DocView doc={v.doc} kind={v.kind} />
              {v.code && (
                <div className="doc-section">
                  <h4>Codigo documentado en esa version</h4>
                  <pre>{v.code}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function DocCenter() {
  const open = useStore((s) => s.docCenterOpen);
  const setOpen = useStore((s) => s.setDocCenterOpen);
  const project = useStore((s) => s.project);
  const [section, setSection] = useState<Section>('general');

  if (!open || !project) return null;

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Centro de documentación — {project.name}</h2>
          <span style={{ flex: 1 }} />
          <ExportarDocumentacion />
          <button className="btn icon" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="doc-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {section === 'general' && <GeneralSection />}
          {section === 'arquitectura' && <ArchitectureSection />}
          {section === 'glosario' && <GlosarioPanel />}
          {section === 'funciones' && <FunctionsSection />}
          {section === 'decisiones' && <DecisionsSection />}
          {section === 'progreso' && <ProgressSection />}
          {section === 'historial' && <HistorySection />}
        </div>
      </div>
    </div>
  );
}
