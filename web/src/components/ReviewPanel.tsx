import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import type { FunctionDoc } from '../lib/types';
import { DocView } from './DocView';
import { AvisosCalidad, Valorar } from './CalidadDoc';
import { api } from '../lib/api';
import type { Proposal } from '../lib/types';
import { Icon } from './Icon';
import { ask } from '../lib/dialogs';

/**
 * Panel de revision humana. Nada llega a la documentacion oficial sin pasar
 * por "Aprobar y guardar".
 */
export function ReviewPanel() {
  const proposals = useStore((s) => s.proposals);
  const activeProposalId = useStore((s) => s.activeProposalId);
  const setActiveProposal = useStore((s) => s.setActiveProposal);
  const approveProposal = useStore((s) => s.approveProposal);
  const discardProposal = useStore((s) => s.discardProposal);
  const editProposal = useStore((s) => s.editProposal);
  const generateDoc = useStore((s) => s.generateDoc);
  const generating = useStore((s) => s.generating);
  const approved = useStore((s) => s.approved);
  const analysis = useStore((s) => s.analysis);
  const symbolsFn = useStore((s) => s.symbols);
  const goToSymbol = useStore((s) => s.goToSymbol);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const proposal = proposals.find((p) => p.id === activeProposalId) ?? proposals[0] ?? null;
  const allFunctions = useMemo(() => symbolsFn(), [symbolsFn, analysis]);
  const liveFunction = proposal ? allFunctions.find((f) => f.id === proposal.functionId) : undefined;
  const previous = proposal ? approved[proposal.functionId] : undefined;

  useEffect(() => {
    setEditing(false);
    setEditError(null);
  }, [proposal?.id]);

  if (!proposal) {
    return (
      <div className="empty">
        <Icon name="docs" size={24} />
        <h3>Sin propuestas pendientes</h3>
        <p>
          Elige una funcion en el panel "Funciones del proyecto" y pulsa "Documentar funcion". La propuesta aparecera
          aqui para que la revises antes de guardarla. Tu codigo nunca se modifica.
        </p>
      </div>
    );
  }

  const startEditing = () => {
    setDraft(JSON.stringify(proposal.doc, null, 2));
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const parsed = JSON.parse(draft) as FunctionDoc;
      await editProposal(proposal.id, parsed);
      setEditing(false);
      setEditError(null);
    } catch (err) {
      setEditError(`El contenido no es JSON valido: ${(err as Error).message}`);
    }
  };

  const regenerate = async () => {
    if (!liveFunction) return;
    const extra = await ask({
      title: 'Regenerar explicación',
      label: 'Indicación para la nueva propuesta (opcional)',
      placeholder: 'Por ejemplo: explica con más detalle el manejo de errores',
      hint: 'Déjalo vacío para regenerar sin indicaciones. La versión aprobada no se toca.',
      confirmText: 'Regenerar',
      allowEmpty: true,
      multiline: true,
    });
    // null = canceló; cadena vacía = regenerar sin indicación.
    if (extra === null) return;
    void generateDoc(liveFunction, extra || undefined, { forzar: true });
  };

  const codeChanged = liveFunction && proposal.codeHash !== liveFunction.codeHash;

  return (
    <div className="review">
      {proposals.length > 1 && (
        <select value={proposal.id} onChange={(e) => setActiveProposal(e.target.value)}>
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.filePath}</option>
          ))}
        </select>
      )}

      <div className="review-banner">
        <strong>Propuesta pendiente de aprobacion.</strong> Generada con {proposal.model ?? 'el modelo configurado'} el{' '}
        {new Date(proposal.createdAt).toLocaleString('es')}. Esta explicacion todavia no forma parte de la documentacion
        oficial y no se ha escrito nada en tus archivos.
        {proposal.edited && <> Contiene ediciones tuyas.</>}
      </div>

      {previous && (
        <div className="review-banner" style={{ background: 'rgba(217,164,65,0.1)', borderColor: 'var(--warn)' }}>
          Esta funcion ya tiene una version aprobada del {new Date(previous.approvedAt).toLocaleString('es')}. Si apruebas
          la nueva, la anterior se conserva en el historial.
        </div>
      )}

      {codeChanged && (
        <div className="review-banner" style={{ background: 'rgba(226,96,106,0.1)', borderColor: 'var(--danger)' }}>
          El codigo de la funcion cambio despues de generar esta propuesta. Conviene regenerarla antes de aprobarla.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="tag">{proposal.filePath}</span>
        {liveFunction && (
          <button className="btn sm outline" onClick={() => void goToSymbol(liveFunction)}>Ir al codigo</button>
        )}
      </div>

      {editing ? (
        <>
          <p className="hint">Edicion manual del contenido (formato JSON). Al guardar sigue siendo una propuesta.</p>
          <textarea
            style={{ minHeight: 360, fontFamily: 'var(--mono)', fontSize: 12 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {editError && <p style={{ color: 'var(--danger)' }}>{editError}</p>}
          <div className="review-actions">
            <button className="btn primary" onClick={() => void saveEdit()}><Icon name="check" size={13} /> Guardar edicion</button>
            <button className="btn outline" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <AvisosCalidad doc={proposal.doc} />
          <DocView doc={proposal.doc} kind={proposal.kind} />
          <div className="ajustes-rapidos">
            <span className="hint">Pedir otra versión:</span>
            {[
              ['Más técnica', 'Hazla más técnica: terminología precisa, detalles de implementación, casos límite.'],
              ['Más sencilla', 'Hazla más sencilla: para alguien que empieza, sin jerga, con una analogía si ayuda.'],
              ['Más breve', 'Hazla más breve: lo esencial en pocas frases por campo.'],
              ['Mejor ejemplo', 'Mejora el ejemplo de uso: realista, completo y comentado.'],
            ].map(([nombre, indicacion]) => (
              <button
                key={nombre}
                className="btn sm outline"
                disabled={generating || !liveFunction}
                title={indicacion}
                onClick={() => liveFunction && void generateDoc(liveFunction, indicacion, { forzar: true })}
              >
                {nombre}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <Valorar key={proposal.id} functionId={proposal.functionId} />
          </div>
          <ComentariosPropuesta
            proposal={proposal}
            puedeRegenerar={Boolean(liveFunction) && !generating}
            regenerar={(texto) => liveFunction && void generateDoc(liveFunction, texto, { forzar: true })}
          />
          <div className="review-actions">
            <button className="btn ok" onClick={() => void approveProposal(proposal.id)}>
              <Icon name="check" size={13} /> Aprobar y guardar
            </button>
            <button className="btn outline" onClick={startEditing}>
              <Icon name="edit" size={13} /> Editar documentacion
            </button>
            <button className="btn outline" onClick={() => void regenerate()} disabled={generating || !liveFunction}>
              {generating ? <span className="spinner" /> : <Icon name="refresh" size={13} />} Regenerar explicacion
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm('Descartar esta propuesta? La documentacion oficial no se vera afectada.')) {
                  void discardProposal(proposal.id);
                }
              }}
            >
              <Icon name="trash" size={13} /> Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Comentarios de revisión en una propuesta: notas tuyas ("el retorno está
 * mal explicado"). Sirven de recordatorio y, si quieres, para pedir otra
 * versión que los tenga en cuenta.
 */
function ComentariosPropuesta({ proposal, puedeRegenerar, regenerar }: {
  proposal: Proposal;
  puedeRegenerar: boolean;
  regenerar: (texto: string) => void;
}) {
  const project = useStore((s) => s.project);
  const [texto, setTexto] = useState('');
  const comentarios = proposal.comentarios ?? [];
  const enviar = async () => {
    if (!project || !texto.trim()) return;
    const { proposals } = await api.comentarPropuesta(project.id, proposal.id, texto.trim());
    useStore.setState({ proposals });
    setTexto('');
  };
  return (
    <div className="comentarios">
      <span className="panel-title">Comentarios de revisión</span>
      {comentarios.map((c, i) => (
        <div key={i} className="comentario">
          <span className="hint">{new Date(c.en).toLocaleString()}</span> {c.texto}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input placeholder="Añade una nota sobre esta propuesta…" value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); }} />
        <button className="btn sm outline" disabled={!texto.trim()} onClick={() => void enviar()}>Comentar</button>
      </div>
      {comentarios.length > 0 && (
        <button
          className="btn sm outline"
          style={{ marginTop: 4 }}
          disabled={!puedeRegenerar}
          onClick={() => regenerar(`Ten en cuenta estos comentarios de revisión del usuario:\n${comentarios.map((c) => `- ${c.texto}`).join('\n')}`)}
        >
          Pedir otra versión con estos comentarios
        </button>
      )}
    </div>
  );
}
