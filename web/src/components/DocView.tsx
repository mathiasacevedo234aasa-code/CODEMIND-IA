import type { FunctionDoc, SymbolKind } from '../lib/types';
import { ES_INVOCABLE } from '../lib/types';

const Certainty = ({ value }: { value?: string }) =>
  value === 'inferido' ? <span className="tag warn">inferido</span> : <span className="tag ok">confirmado</span>;

/**
 * Render de una propuesta o de una version aprobada. Mismo formato en ambos
 * casos.
 *
 * El titulo dice QUE es lo documentado. Antes ponia siempre "Funcion", asi que
 * un <form> o una regla CSS aparecian como funciones, que es sencillamente
 * falso. Por lo mismo, a lo que no se invoca no se le ensenan las secciones de
 * parametros y retorno: en una seccion de HTML no significan nada, y decir
 * "no recibe parametros" es responder a una pregunta que nadie hizo.
 */
export function DocView({ doc, kind }: { doc: FunctionDoc; kind?: SymbolKind }) {
  const invocable = !kind || ES_INVOCABLE.has(kind);
  const titulo = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Elemento';

  return (
    <>
      <div className="doc-section">
        <h4>{titulo}</h4>
        <p><code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{doc.nombre}</code></p>
      </div>

      <div className="doc-section">
        <h4>Proposito</h4>
        <p>{doc.proposito}</p>
      </div>

      <div className="doc-section">
        <h4>Explicacion teorica</h4>
        <p>{doc.explicacion}</p>
      </div>

      {invocable && (
        <>
        <div className="doc-section">
          <h4>Parametros</h4>
          {doc.parametros?.length ? (
            doc.parametros.map((p, i) => (
              <div className="param-row" key={`${p.nombre}-${i}`}>
                <div>
                  <code>{p.nombre}</code>
                  {p.tipo && <span style={{ color: 'var(--text-faint)' }}> : {p.tipo}</span>}
                  <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>{p.descripcion}</div>
                </div>
                <Certainty value={p.certeza} />
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-faint)' }}>No recibe parametros.</p>
          )}
        </div>

        <div className="doc-section">
          <h4>Retorno</h4>
          <p>
            {doc.retorno?.descripcion ?? 'No indicado.'}{' '}
            {doc.retorno?.tipo && <span style={{ color: 'var(--text-faint)' }}>({doc.retorno.tipo})</span>}{' '}
            <Certainty value={doc.retorno?.certeza} />
          </p>
        </div>
        </>
      )}

      <div className="doc-section">
        <h4>{invocable ? 'Flujo de ejecucion' : 'Como se compone'}</h4>
        {doc.flujo?.length ? (
          <ol>{doc.flujo.map((step, i) => <li key={i}>{step}</li>)}</ol>
        ) : (
          <p style={{ color: 'var(--text-faint)' }}>Sin pasos descritos.</p>
        )}
      </div>

      <div className="doc-section">
        <h4>Dependencias</h4>
        {doc.dependencias?.length ? (
          <ul>
            {doc.dependencias.map((d, i) => (
              <li key={i}>
                <code style={{ fontFamily: 'var(--mono)' }}>{d.nombre}</code>{' '}
                <span style={{ color: 'var(--text-faint)' }}>({d.clase})</span> <Certainty value={d.certeza} />
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--text-faint)' }}>No se identificaron dependencias externas.</p>
        )}
      </div>

      <div className="doc-section">
        <h4>Ejemplo de uso</h4>
        <pre>{doc.ejemplo}</pre>
      </div>

      <div className="doc-section">
        <h4>Observaciones</h4>
        <p>{doc.observaciones || 'Sin observaciones.'}</p>
      </div>

      {doc.incertidumbres?.length ? (
        <div className="doc-section">
          <h4>Lo que no puede deducirse del codigo</h4>
          <ul>{doc.incertidumbres.map((u, i) => <li key={i}>{u}</li>)}</ul>
        </div>
      ) : null}
    </>
  );
}
