import { useEffect, useRef, useState } from 'react';
import { useDialogs } from '../lib/dialogs';
import { Icon } from './Icon';

/**
 * Presenta el diálogo de entrada de texto. Va montado una sola vez en App y
 * atiende a cualquier llamada a `ask()`, venga de donde venga.
 */
export function DialogHost() {
  const current = useDialogs((s) => s.current);
  const close = useDialogs((s) => s.close);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!current) return;
    setValue(current.value ?? '');
    setError(null);
    // Se selecciona el texto inicial: al renombrar, lo normal es reescribirlo.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (current.value) inputRef.current?.select();
    });
  }, [current]);

  if (!current) return null;

  const aceptar = () => {
    const texto = value.trim();
    if (!texto && !current.allowEmpty) {
      setError('Escribe un valor.');
      return;
    }
    const problema = current.validate?.(texto) ?? null;
    if (problema) {
      setError(problema);
      return;
    }
    close(texto);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(current.multiline && e.shiftKey)) {
      e.preventDefault();
      aceptar();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close(null);
    }
  };

  return (
    <div className="overlay" style={{ zIndex: 80 }} onClick={() => close(null)}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{current.title}</h2>
          <button className="btn icon" onClick={() => close(null)} aria-label="Cancelar">
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-body">
          <div className="field" style={{ marginBottom: 0 }}>
            {current.label && <label>{current.label}</label>}
            {current.multiline ? (
              <textarea
                ref={(el) => { inputRef.current = el; }}
                value={value}
                placeholder={current.placeholder}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={onKeyDown}
                style={{ minHeight: 90 }}
              />
            ) : (
              <input
                ref={(el) => { inputRef.current = el; }}
                type="text"
                value={value}
                placeholder={current.placeholder}
                spellCheck={false}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={onKeyDown}
              />
            )}
            {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
            {!error && current.hint && <p className="hint">{current.hint}</p>}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn outline" onClick={() => close(null)}>Cancelar</button>
          <button className="btn primary" onClick={aceptar}>
            <Icon name="check" size={13} /> {current.confirmText ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}
