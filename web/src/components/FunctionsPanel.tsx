import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import type { DocStatus } from '../lib/types';
import { Icon } from './Icon';

const STATUS_LABEL: Record<DocStatus, string> = {
  'sin-documentar': 'Sin documentar',
  documentada: 'Documentada',
  revisar: 'Revisar documentacion',
};

const STATUS_CLASS: Record<DocStatus, string> = {
  'sin-documentar': 'muted',
  documentada: 'ok',
  revisar: 'warn',
};

export function FunctionsPanel() {
  const functionsFn = useStore((s) => s.functions);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const statusOf = useStore((s) => s.statusOf);
  const goToFunction = useStore((s) => s.goToFunction);
  const generateDoc = useStore((s) => s.generateDoc);
  const generating = useStore((s) => s.generating);
  const scanning = useStore((s) => s.scanning);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const relinks = useStore((s) => s.relinks);
  const applyRelink = useStore((s) => s.applyRelink);
  const dismissRelink = useStore((s) => s.dismissRelink);
  const proposals = useStore((s) => s.proposals);

  const [query, setQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | DocStatus>('');
  const [selected, setSelected] = useState<string | null>(null);

  // `analysis` en las dependencias mantiene la lista viva mientras se escribe.
  const all = useMemo(() => functionsFn(), [functionsFn, analysis]);
  const files = useMemo(() => [...new Set(all.map((f) => f.filePath))].sort(), [all]);

  const visible = all.filter((fn) => {
    if (query && !`${fn.qualifiedName} ${fn.filePath}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (fileFilter && fn.filePath !== fileFilter) return false;
    if (statusFilter && statusOf(fn) !== statusFilter) return false;
    return true;
  });

  const parseErrors = Object.entries(analysis).filter(([, a]) => a.error);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="filters">
        <input placeholder="Buscar funcion..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}>
          <option value="">Todos los archivos</option>
          {files.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DocStatus | '')}>
          <option value="">Cualquier estado</option>
          <option value="sin-documentar">Sin documentar</option>
          <option value="documentada">Documentada</option>
          <option value="revisar">Revisar</option>
        </select>
      </div>

      <div className="panel-body">
        {relinks.length > 0 && (
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            {relinks.map((r) => (
              <div key={r.fromFunctionId} className="review-banner" style={{ marginBottom: 6 }}>
                <strong>Posible funcion renombrada o movida.</strong> La documentacion de <code>{r.previousName}</code> coincide
                exactamente con el codigo de <code>{r.name}</code> en <code>{r.filePath}</code>. Confirmas la reasignacion?
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn ok sm" onClick={() => void applyRelink(r)}><Icon name="link" size={12} /> Reasignar</button>
                  <button className="btn sm outline" onClick={() => dismissRelink(r.fromFunctionId)}>Ahora no</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {parseErrors.length > 0 && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <span className="tag warn"><Icon name="warn" size={11} /> {parseErrors.length} archivo(s) con codigo incompleto</span>
            <p className="hint" style={{ marginTop: 6 }}>
              Se conserva el ultimo analisis valido. El panel se actualiza en cuanto el codigo vuelva a ser analizable.
            </p>
          </div>
        )}

        {scanning && <p className="hint" style={{ padding: 12 }}>Analizando archivos del proyecto...</p>}

        {!scanning && visible.length === 0 && (
          <div className="empty" style={{ height: 'auto', paddingTop: 36 }}>
            <Icon name="fn" size={22} />
            <h3>Sin funciones detectadas</h3>
            <p>
              Escribe funciones en archivos .js, .jsx, .ts, .tsx, .vue o .svelte. La deteccion usa un analizador
              sintactico local: tu codigo no se envia a ningun servicio hasta que pulses "Documentar".
            </p>
          </div>
        )}

        {visible.map((fn) => {
          const status = statusOf(fn);
          const doc = approved[fn.id];
          const pending = proposals.find((p) => p.functionId === fn.id);
          return (
            <div
              key={fn.id}
              className={`fn-item ${selected === fn.id ? 'selected' : ''}`}
              onClick={() => { setSelected(fn.id); void goToFunction(fn); }}
            >
              <div className="fn-head">
                <Icon name="fn" size={13} />
                <span className="fn-name">{fn.qualifiedName}</span>
                <span className="spacer" style={{ flex: 1 }} />
                <span className={`tag ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
              </div>
              <div className="fn-meta">
                <span>{fn.filePath}</span>
                <span>linea {fn.line}</span>
                <span>{fn.kind}</span>
                {fn.isAsync && <span>async</span>}
              </div>
              {doc && (
                <div className="fn-meta">
                  <span>Documentada el {new Date(doc.approvedAt).toLocaleString('es')}</span>
                  {status === 'revisar' && <span style={{ color: 'var(--warn)' }}>El codigo cambio desde esa version</span>}
                </div>
              )}
              {pending && <div className="fn-meta"><span className="tag info">Propuesta pendiente de revisar</span></div>}
              <div className="fn-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn sm primary"
                  disabled={generating || !apiKeyConfigured}
                  title={apiKeyConfigured ? 'Enviar esta funcion a Groq para obtener una propuesta' : 'Configura la API key de Groq primero'}
                  onClick={() => void generateDoc(fn)}
                >
                  {generating ? <span className="spinner" /> : <Icon name="brain" size={12} />}
                  {status === 'sin-documentar' ? 'Documentar funcion' : 'Nueva explicacion'}
                </button>
                <button className="btn sm outline" onClick={() => void goToFunction(fn)}>Ir al codigo</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '6px 10px', fontSize: 11, color: 'var(--text-faint)' }}>
        {all.length} funcion(es) detectadas · {Object.keys(approved).length} documentada(s) · {proposals.length} propuesta(s) pendiente(s)
      </div>
    </div>
  );
}
