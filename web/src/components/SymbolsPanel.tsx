import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import type { DocStatus, SymbolCategory, SymbolKind } from '../lib/types';
import { Icon } from './Icon';

const STATUS_LABEL: Record<DocStatus, string> = {
  'sin-documentar': 'Sin documentar',
  documentada: 'Documentada',
  revisar: 'Revisar documentación',
};

const STATUS_CLASS: Record<DocStatus, string> = {
  'sin-documentar': 'muted',
  documentada: 'ok',
  revisar: 'warn',
};

const CATEGORIAS: { id: SymbolCategory; label: string }[] = [
  { id: 'codigo', label: 'Código' },
  { id: 'estructura', label: 'Estructura' },
  { id: 'estilo', label: 'Estilos' },
  { id: 'contenido', label: 'Contenido' },
];

/** Un icono por familia, para reconocer el tipo de un vistazo. */
const ICONO_DE: Partial<Record<SymbolKind, string>> = {
  clase: 'history',
  interfaz: 'link',
  tipo: 'link',
  enumeracion: 'docs',
  constante: 'file',
  'bloque de script': 'terminal',
  'bloque de estilo': 'edit',
  seccion: 'folder',
  'elemento con id': 'link',
  formulario: 'edit',
  tabla: 'docs',
  lista: 'docs',
  'componente personalizado': 'fn',
  'regla CSS': 'edit',
  'consulta de medios': 'edit',
  animacion: 'play',
  'variable CSS': 'file',
  encabezado: 'docs',
  'manejador en linea': 'play',
  enlace: 'link',
  multimedia: 'play',
  control: 'edit',
  contenedor: 'folder',
  metadato: 'file',
  texto: 'docs',
};

/**
 * Panel de elementos del proyecto.
 *
 * Ya no lista solo funciones: también la estructura de las páginas, las reglas
 * de estilo y los encabezados de la documentación. Un proyecto web se entiende
 * mirando las tres cosas, no solo el JavaScript.
 */
export function SymbolsPanel() {
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const statusOf = useStore((s) => s.statusOf);
  const goToSymbol = useStore((s) => s.goToSymbol);
  const generateDoc = useStore((s) => s.generateDoc);
  const generating = useStore((s) => s.generating);
  const scanning = useStore((s) => s.scanning);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const relinks = useStore((s) => s.relinks);
  const applyRelink = useStore((s) => s.applyRelink);
  const dismissRelink = useStore((s) => s.dismissRelink);
  const proposals = useStore((s) => s.proposals);
  const orphansFn = useStore((s) => s.orphans);

  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | DocStatus>('');
  const [categorias, setCategorias] = useState<Set<SymbolCategory>>(
    () => new Set<SymbolCategory>(['codigo', 'estructura', 'estilo', 'contenido']),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [soloHuerfanos, setSoloHuerfanos] = useState(false);
  // Una pagina entera son muchas etiquetas. Se muestran todas, pero se puede
  // esconder el relleno —parrafos y divs sin id ni clase— de un clic.
  const [sinRelleno, setSinRelleno] = useState(false);

  // `analysis` en las dependencias mantiene la lista viva mientras se escribe.
  const todos = useMemo(() => symbolsFn(), [symbolsFn, analysis]);
  const archivos = useMemo(() => [...new Set(todos.map((s) => s.filePath))].sort(), [todos]);

  const porCategoria = useMemo(() => {
    const cuenta: Record<SymbolCategory, number> = { codigo: 0, estructura: 0, estilo: 0, contenido: 0 };
    for (const s of todos) cuenta[s.category]++;
    return cuenta;
  }, [todos]);

  // Se calcula solo cuando se pide: recorrer todo el proyecto no es gratis.
  const huerfanos = useMemo(() => (soloHuerfanos ? orphansFn() : []), [soloHuerfanos, orphansFn, analysis]);
  const mapaHuerfanos = useMemo(() => new Map(huerfanos.map((h) => [h.symbol.id, h])), [huerfanos]);

  const relleno = useMemo(() => todos.filter((s) => s.menor).length, [todos]);

  const visibles = (soloHuerfanos ? huerfanos.map((h) => h.symbol) : todos).filter((s) => {
    if (sinRelleno && s.menor) return false;
    if (!categorias.has(s.category)) return false;
    if (query && !`${s.qualifiedName} ${s.filePath} ${s.kind}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (fileFilter && s.filePath !== fileFilter) return false;
    if (statusFilter && statusOf(s) !== statusFilter) return false;
    return true;
  });

  const erroresDeAnalisis = Object.entries(analysis).filter(([, a]) => a.error);

  const alternarCategoria = (id: SymbolCategory) =>
    setCategorias((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="filters">
        <input placeholder="Buscar elemento..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}>
          <option value="">Todos los archivos</option>
          {archivos.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DocStatus | '')}>
          <option value="">Cualquier estado</option>
          <option value="sin-documentar">Sin documentar</option>
          <option value="documentada">Documentada</option>
          <option value="revisar">Revisar</option>
        </select>
      </div>

      <div className="categoria-row">
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            className={`mode-chip ${categorias.has(c.id) ? 'active' : ''}`}
            onClick={() => alternarCategoria(c.id)}
            title={`Mostrar u ocultar ${c.label.toLowerCase()}`}
            disabled={porCategoria[c.id] === 0}
          >
            {c.label}{porCategoria[c.id] > 0 ? ` ${porCategoria[c.id]}` : ''}
          </button>
        ))}
        {relleno > 0 && (
          <button
            className={`mode-chip ${sinRelleno ? 'active' : ''}`}
            onClick={() => setSinRelleno((v) => !v)}
            title="Esconde los párrafos, celdas y contenedores que no llevan id ni clase"
          >
            Sin relleno {relleno}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button
          className={`mode-chip ${soloHuerfanos ? 'active' : ''}`}
          onClick={() => setSoloHuerfanos((v) => !v)}
          title="Elementos de los que no se encuentra ningún uso en el proyecto"
        >
          Sin usar
        </button>
      </div>

      <div className="panel-body">
        {soloHuerfanos && (
          <div className="review-banner" style={{ margin: 10 }}>
            Son <strong>sospechas</strong>, no certezas: se busca el nombre por todo el proyecto, sin analizar
            ámbitos. Revisa cada caso antes de tocar nada. CodeMind AI no borra ni propone borrar.
            {huerfanos.length === 0 && <div style={{ marginTop: 6 }}>No se encontró ningún elemento sin usar.</div>}
          </div>
        )}
        {relinks.length > 0 && (
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            {relinks.map((r) => (
              <div key={r.fromFunctionId} className="review-banner" style={{ marginBottom: 6 }}>
                <strong>Posible elemento renombrado o movido.</strong> La documentación de <code>{r.previousName}</code>{' '}
                coincide exactamente con el código de <code>{r.name}</code> en <code>{r.filePath}</code>. ¿Confirmas la
                reasignación?
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn ok sm" onClick={() => void applyRelink(r)}><Icon name="link" size={12} /> Reasignar</button>
                  <button className="btn sm outline" onClick={() => dismissRelink(r.fromFunctionId)}>Ahora no</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {erroresDeAnalisis.length > 0 && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <span className="tag warn"><Icon name="warn" size={11} /> {erroresDeAnalisis.length} archivo(s) con código incompleto</span>
            <p className="hint" style={{ marginTop: 6 }}>
              Se conserva el último análisis válido. La lista se actualiza en cuanto el código vuelva a ser analizable.
            </p>
          </div>
        )}

        {scanning && <p className="hint" style={{ padding: 12 }}>Analizando los archivos del proyecto...</p>}

        {!scanning && visibles.length === 0 && (
          <div className="empty" style={{ height: 'auto', paddingTop: 36 }}>
            <Icon name="fn" size={22} />
            <h3>Sin elementos que mostrar</h3>
            <p>
              Se analizan tus páginas enteras —<strong>todas las etiquetas</strong>, con sus atributos— y también
              el código dentro de <code>&lt;script&gt;</code> y <code>&lt;style&gt;</code>, las reglas CSS, el
              JavaScript y TypeScript, y otros catorce lenguajes: Python, Java, C#, Go, PHP, Ruby, Rust, C, C++,
              Bash, Lua, Kotlin, Swift y Dart.
            </p>
            <p className="hint">
              El análisis es local: tu código no sale del equipo hasta que pulses «Documentar».
            </p>
          </div>
        )}

        {visibles.map((sym) => {
          const status = statusOf(sym);
          const doc = approved[sym.id];
          const pending = proposals.find((p) => p.functionId === sym.id);
          return (
            <div
              key={sym.id}
              className={`fn-item ${selected === sym.id ? 'selected' : ''}`}
              onClick={() => { setSelected(sym.id); void goToSymbol(sym); }}
            >
              <div className="fn-head">
                <Icon name={ICONO_DE[sym.kind] ?? 'fn'} size={13} />
                <span className="fn-name">{sym.qualifiedName}</span>
                <span style={{ flex: 1 }} />
                <span className={`tag ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
              </div>
              <div className="fn-meta">
                <span>{sym.filePath}</span>
                <span>línea {sym.line}</span>
                <span className="tag muted">{sym.kind}</span>
                {sym.isAsync && <span>async</span>}
              </div>
              {sym.detail && <div className="fn-meta"><span>{sym.detail}</span></div>}
              {mapaHuerfanos.has(sym.id) && (
                <div className="fn-meta">
                  <span className={`tag ${mapaHuerfanos.get(sym.id)!.fiable ? 'warn' : 'muted'}`}>
                    {mapaHuerfanos.get(sym.id)!.motivo}
                  </span>
                  {mapaHuerfanos.get(sym.id)!.aviso && (
                    <span style={{ color: 'var(--text-faint)' }}>{mapaHuerfanos.get(sym.id)!.aviso}</span>
                  )}
                </div>
              )}
              {doc && (
                <div className="fn-meta">
                  <span>Documentado el {new Date(doc.approvedAt).toLocaleString('es')}</span>
                  {status === 'revisar' && <span style={{ color: 'var(--warn)' }}>El código cambió desde esa versión</span>}
                </div>
              )}
              {pending && <div className="fn-meta"><span className="tag info">Propuesta pendiente de revisar</span></div>}
              <div className="fn-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn sm primary"
                  disabled={generating || !apiKeyConfigured}
                  title={apiKeyConfigured ? 'Enviar este elemento a la IA para obtener una explicación' : 'Configura el servicio de IA primero'}
                  onClick={() => void generateDoc(sym)}
                >
                  {generating ? <span className="spinner" /> : <Icon name="brain" size={12} />}
                  {status === 'sin-documentar' ? 'Documentar' : 'Nueva explicación'}
                </button>
                <button className="btn sm outline" onClick={() => void goToSymbol(sym)}>Ir al código</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '6px 10px', fontSize: 11, color: 'var(--text-faint)' }}>
        {todos.length} elemento(s) · {Object.keys(approved).length} documentado(s) · {proposals.length} propuesta(s) pendiente(s)
      </div>
    </div>
  );
}
