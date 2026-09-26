import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { Glosario, PropuestaGlosario, TerminoGlosario } from '../lib/types';
import { ask } from '../lib/dialogs';
import { Icon } from './Icon';

/**
 * Glosario del proyecto.
 *
 * Todo proyecto acaba teniendo palabras propias —«carrito», «reserva»,
 * «pedido en firme»— que quien lleva meses dentro da por sabidas y quien
 * llega no entiende. Peor todavía: a veces la misma palabra significa dos
 * cosas distintas en dos partes del código.
 *
 * La IA propone; tú decides. Ningún término entra en el glosario sin que una
 * persona lo haya leído, igual que con la documentación. Y cada uno guarda en
 * qué archivos se vio, para que nadie tenga que fiarse de la palabra de un
 * modelo.
 */
export function GlosarioPanel() {
  const project = useStore((s) => s.project);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const proveedorNombre = useStore((s) => s.proveedorNombre);
  const openFile = useStore((s) => s.openFile);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);
  const log = useStore((s) => s.log);

  const [glosario, setGlosario] = useState<Glosario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');

  useEffect(() => {
    if (!project) return;
    api.glosario(project.id).then(setGlosario).catch((e: Error) => setError(e.message));
  }, [project]);

  // El inventario que se manda: nombres, tipos y archivos. Ni una línea de
  // código, que para reconocer vocabulario no hace ninguna falta.
  const elementos = useMemo(
    () => symbolsFn().map((s) => ({ nombre: s.qualifiedName, tipo: s.kind, archivo: s.filePath })),
    [symbolsFn, analysis],
  );

  const proponer = async () => {
    if (!project) return;
    setProponiendo(true);
    setError(null);
    try {
      const res = await api.glosarioProponer(project.id, elementos);
      setGlosario(res.glosario);
      log('documentacion', 'info',
        `Glosario: ${res.nuevas} término(s) propuesto(s) por ${res.modelo}. Ninguno se guarda hasta que lo apruebes.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProponiendo(false);
    }
  };

  const conError = (accion: Promise<Glosario>) =>
    accion.then(setGlosario).catch((e: Error) => setError(e.message));

  const anadirAMano = async () => {
    if (!project) return;
    const termino = await ask({
      title: 'Nuevo término del glosario',
      label: '¿Qué palabra?',
      placeholder: 'carrito, reserva, pedido en firme...',
      validate: (v) => (v.trim() ? null : 'Escribe el término.'),
    });
    if (!termino) return;
    const definicion = await ask({
      title: `¿Qué significa «${termino}» en este proyecto?`,
      label: 'Definición',
      hint: 'Explícalo como se lo explicarías a alguien que entra hoy al proyecto.',
      multiline: true,
      validate: (v) => (v.trim() ? null : 'Escribe la definición.'),
    });
    if (!definicion) return;
    await conError(api.glosarioAnadir(project.id, { termino, definicion }));
  };

  const guardarEdicion = async (t: TerminoGlosario) => {
    if (!project) return;
    await conError(api.glosarioEditar(project.id, t.id, { ...t, definicion: borrador }));
    setEditando(null);
  };

  const abrir = async (ruta: string) => {
    await openFile(ruta);
    setDocCenterOpen(false);
  };

  if (!project) return null;

  const terminos = (glosario?.terminos ?? []).filter((t) =>
    !busqueda || `${t.termino} ${t.definicion} ${t.aliases.join(' ')}`.toLowerCase().includes(busqueda.toLowerCase()));
  const propuestas = glosario?.propuestas ?? [];

  return (
    <>
      <p className="hint" style={{ marginBottom: 10 }}>
        Las palabras propias de este proyecto, con su significado y con los archivos donde aparecen.
        La IA propone candidatos a partir de los nombres del código; <strong>ninguno entra aquí hasta
        que tú lo apruebas</strong>. El asistente usa después este glosario como vocabulario dado por bueno.
      </p>

      {error && <div className="review-banner" style={{ borderColor: 'var(--bad)', marginBottom: 10 }}>{error}</div>}

      <div className="filters" style={{ marginBottom: 10 }}>
        <input placeholder="Buscar término..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button className="btn sm outline" onClick={() => void anadirAMano()}>
          <Icon name="edit" size={12} /> Añadir a mano
        </button>
        <button
          className="btn sm primary"
          disabled={proponiendo || !apiKeyConfigured || !elementos.length}
          title={!apiKeyConfigured
            ? `Configura ${proveedorNombre} primero`
            : !elementos.length
              ? 'Todavía no hay elementos analizados de los que sacar vocabulario'
              : 'Pide candidatos a la IA. No guarda nada por su cuenta.'}
          onClick={() => void proponer()}
        >
          {proponiendo ? <span className="spinner" /> : <Icon name="brain" size={12} />}
          {proponiendo ? 'Buscando términos...' : 'Proponer términos'}
        </button>
      </div>

      {propuestas.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--warn)' }}>
          <h4>{propuestas.length} propuesta(s) sin revisar</h4>
          <p className="hint">Léelas antes de aprobarlas: son de un modelo, no de una persona.</p>
          {propuestas.map((p: PropuestaGlosario) => (
            <div key={p.id} className="glosario-item">
              <div className="glosario-cabecera">
                <strong>{p.termino}</strong>
                {p.aliases.length > 0 && <span className="tag muted">también: {p.aliases.join(', ')}</span>}
                <span style={{ flex: 1 }} />
                <span className="tag info">{p.modelo}</span>
              </div>
              <p>{p.definicion}</p>
              {p.notas && <p className="hint"><Icon name="warn" size={11} /> {p.notas}</p>}
              {p.apariciones.length > 0 && (
                <div className="fn-meta">
                  <span>visto en:</span>
                  {p.apariciones.map((a) => (
                    <code key={a} className="glosario-ruta" onClick={() => void abrir(a)}>{a}</code>
                  ))}
                </div>
              )}
              <div className="fn-actions">
                <button className="btn sm ok" onClick={() => void conError(api.glosarioAprobar(project.id, p.id))}>
                  <Icon name="check" size={12} /> Aprobar
                </button>
                <button className="btn sm outline" onClick={() => void conError(api.glosarioDescartar(project.id, p.id))}>
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {terminos.length === 0 && propuestas.length === 0 && (
        <div className="empty" style={{ height: 'auto', paddingTop: 30 }}>
          <Icon name="docs" size={22} />
          <h3>El glosario está vacío</h3>
          <p>
            Pulsa «Proponer términos» para que la IA busque el vocabulario propio de este proyecto en los
            nombres de tu código, o añade el primero a mano.
          </p>
        </div>
      )}

      {terminos.map((t) => (
        <div key={t.id} className="glosario-item">
          <div className="glosario-cabecera">
            <strong>{t.termino}</strong>
            {t.aliases.length > 0 && <span className="tag muted">también: {t.aliases.join(', ')}</span>}
            <span style={{ flex: 1 }} />
            <span className={`tag ${t.origen === 'persona' ? 'ok' : 'info'}`}>
              {t.origen === 'persona' ? 'escrito por ti' : 'propuesto y aprobado'}
            </span>
          </div>

          {editando === t.id ? (
            <>
              <textarea rows={4} value={borrador} onChange={(e) => setBorrador(e.target.value)} />
              <div className="fn-actions">
                <button className="btn sm primary" disabled={!borrador.trim()} onClick={() => void guardarEdicion(t)}>
                  Guardar
                </button>
                <button className="btn sm outline" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <p>{t.definicion}</p>
              {t.notas && <p className="hint"><Icon name="warn" size={11} /> {t.notas}</p>}
              {t.apariciones.length > 0 && (
                <div className="fn-meta">
                  <span>visto en:</span>
                  {t.apariciones.map((a) => (
                    <code key={a} className="glosario-ruta" onClick={() => void abrir(a)}>{a}</code>
                  ))}
                </div>
              )}
              <div className="fn-actions">
                <button className="btn sm outline" onClick={() => { setEditando(t.id); setBorrador(t.definicion); }}>
                  <Icon name="edit" size={12} /> Editar
                </button>
                <button className="btn sm danger" onClick={() => void conError(api.glosarioBorrar(project.id, t.id))}>
                  Quitar
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {terminos.length > 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          {terminos.length} término(s). Los archivos citados son los que el modelo vio en la lista que se le
          envió: púlsalos para comprobarlo tú mismo.
        </p>
      )}
    </>
  );
}
