import { useEffect, useLayoutEffect, useState } from 'react';
import { marked } from './miniMarkdown';
import changelog from '../../../CHANGELOG.md?raw';
import paquete from '../../package.json';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

/**
 * Tres cosas para que la aplicación se deje descubrir:
 *
 * - Un **tour** de cuatro pasos la primera vez. Con seis vistas, ocho
 *   pestañas abajo y un asistente, quien abre la aplicación por primera vez
 *   no encuentra ni la mitad. Se puede saltar y no vuelve a salir.
 * - La **pantalla de atajos** (Ctrl+/), con los atajos que de verdad existen.
 * - **Qué hay de nuevo** al actualizar: las secciones del historial de
 *   versiones posteriores a la última que viste.
 *
 * Lo que recuerda (si ya viste el tour, qué versión viste) va en el
 * almacenamiento local del navegador, envuelto en try: si no está disponible
 * simplemente no se recuerda, pero nada se rompe.
 */

const VERSION = paquete.version as string;

const leer = (clave: string) => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardar = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };

// ------------------------------------------------------------------ tour

const PASOS = [
  {
    selector: '.rail',
    titulo: 'Las vistas, a la izquierda',
    texto: 'Explorador, Buscar, Elementos del proyecto, Git, GitHub y Ejecutar. Pulsa el mismo icono otra vez para plegar el panel.',
  },
  {
    selector: '.editor-mitades',
    titulo: 'El editor',
    texto: 'Con ▷ (o F5) ejecutas el archivo abierto. Pasa el cursor sobre algo documentado para leer su explicación, y F12 te lleva a su definición.',
  },
  {
    selector: '.panel.right',
    titulo: 'Revisión, Documentación y Asistente',
    texto: 'Lo que propone la IA llega a Revisión y no es oficial hasta que lo apruebas. En Documentación lees lo aprobado del archivo abierto.',
  },
  {
    selector: '.bottom',
    titulo: 'Consola, Terminal y compañía',
    texto: 'El terminal es de verdad, Comprobaciones ejecuta tus pruebas y tipos, y Vista previa enseña tu página. Ctrl+Shift+P abre todos los comandos.',
  },
];

function Tour({ alTerminar }: { alTerminar: () => void }) {
  const t = useT();
  const [paso, setPaso] = useState(0);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const actual = PASOS[paso];

  useLayoutEffect(() => {
    const medir = () => setCaja(document.querySelector(actual.selector)?.getBoundingClientRect() ?? null);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [actual.selector]);

  // La tarjeta se coloca al lado de lo que explica, sin salirse de la pantalla.
  const ancho = 320;
  const izquierda = caja
    ? Math.min(Math.max(12, caja.left + caja.width / 2 - ancho / 2), window.innerWidth - ancho - 12)
    : window.innerWidth / 2 - ancho / 2;
  const arriba = caja
    ? (caja.top > window.innerHeight / 2 ? Math.max(12, caja.top - 190) : Math.min(caja.bottom + 12, window.innerHeight - 200))
    : window.innerHeight / 2 - 90;

  return (
    <div className="tour">
      {caja && (
        <div
          className="tour-foco"
          style={{ left: caja.left - 4, top: caja.top - 4, width: caja.width + 8, height: caja.height + 8 }}
        />
      )}
      <div className="tour-tarjeta" style={{ left: izquierda, top: arriba, width: ancho }}>
        <div className="meta">{t('{n} de {total}', { n: paso + 1, total: PASOS.length })}</div>
        <h3>{t(actual.titulo)}</h3>
        <p>{t(actual.texto)}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="btn sm outline" onClick={alTerminar}>{t('Saltar')}</button>
          <span style={{ flex: 1 }} />
          {paso > 0 && <button className="btn sm outline" onClick={() => setPaso(paso - 1)}>{t('Atrás')}</button>}
          <button
            className="btn sm primary"
            onClick={() => (paso === PASOS.length - 1 ? alTerminar() : setPaso(paso + 1))}
          >
            {t(paso === PASOS.length - 1 ? 'Empezar' : 'Siguiente')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- atajos

const ATAJOS: [string, string][] = [
  ['Ctrl+Shift+P', 'Paleta de comandos: cualquier acción y cualquier archivo'],
  ['Ctrl+P', 'Ir a un archivo (búsqueda difusa)'],
  ['Ctrl+T', 'Ir a un símbolo del proyecto'],
  ['Ctrl+K Ctrl+1…7', 'Plegar el código al nivel 1…7 (Ctrl+K Ctrl+J despliega todo)'],
  ['F12 / Ctrl+clic', 'Ir a la definición de lo que hay bajo el cursor'],
  ['F5', 'Ejecutar el archivo abierto en el Terminal'],
  ['Ctrl+S', 'Guardar'],
  ['Ctrl+Shift+F', 'Buscar y reemplazar en todo el proyecto'],
  ['Ctrl+Shift+E', 'Explicar con la IA el código seleccionado'],
  ['Ctrl+Enter', 'Enviar la pregunta al asistente'],
  ['Ctrl+/', 'Esta lista'],
];

function Atajos({ alCerrar }: { alCerrar: () => void }) {
  const t = useT();
  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('Atajos de teclado')}</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {ATAJOS.map(([tecla, que]) => (
            <div key={tecla} className="atajo-fila">
              <kbd>{tecla}</kbd>
              <span>{t(que)}</span>
            </div>
          ))}
          <p className="hint" style={{ marginTop: 10 }}>{t('En Mac, Ctrl es ⌘.')}</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------ qué hay de nuevo

/** Las secciones del historial posteriores a la versión que el usuario ya vio. */
export function novedadesDesde(texto: string, vista: string | null): string {
  const secciones = texto.split(/\n(?=## \d)/).filter((s) => /^## \d/.test(s));
  if (!vista) return secciones[0] ?? '';
  const nuevas: string[] = [];
  for (const s of secciones) {
    if (s.startsWith(`## ${vista}`)) break;
    nuevas.push(s);
  }
  return nuevas.join('\n\n');
}

function Novedades({ desde, alCerrar }: { desde: string | null; alCerrar: () => void }) {
  const t = useT();
  const texto = novedadesDesde(changelog, desde);
  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('Qué hay de nuevo en la {v}', { v: VERSION })}</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body novedades" dangerouslySetInnerHTML={{ __html: marked(texto) }} />
        <div className="modal-foot">
          <button className="btn primary" onClick={alCerrar}>{t('Entendido')}</button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- montaje

export function Bienvenida({ proyectoAbierto }: { proyectoAbierto: boolean }) {
  const [tour, setTour] = useState(false);
  const [atajos, setAtajos] = useState(false);
  const [novedades, setNovedades] = useState<{ desde: string | null } | null>(null);

  // Qué hay de nuevo: solo al cambiar de versión, y nunca en la primera vez
  // (a quien acaba de instalar no le interesa lo que cambió antes).
  useEffect(() => {
    const vista = leer('codemind.version-vista');
    if (vista && vista !== VERSION) setNovedades({ desde: vista });
    if (!vista) guardar('codemind.version-vista', VERSION);
  }, []);

  // El tour, la primera vez que hay un proyecto abierto: sin proyecto no hay
  // nada que señalar.
  useEffect(() => {
    if (proyectoAbierto && !leer('codemind.tour-visto')) {
      const t = setTimeout(() => setTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [proyectoAbierto]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setAtajos((v) => !v);
      }
    };
    const pedirAtajos = () => setAtajos(true);
    const pedirTour = () => setTour(true);
    const pedirNovedades = () => setNovedades({ desde: null });
    window.addEventListener('keydown', alPulsar);
    window.addEventListener('codemind:atajos', pedirAtajos);
    window.addEventListener('codemind:tour', pedirTour);
    window.addEventListener('codemind:novedades', pedirNovedades);
    return () => {
      window.removeEventListener('keydown', alPulsar);
      window.removeEventListener('codemind:atajos', pedirAtajos);
      window.removeEventListener('codemind:tour', pedirTour);
      window.removeEventListener('codemind:novedades', pedirNovedades);
    };
  }, []);

  return (
    <>
      {tour && proyectoAbierto && (
        <Tour alTerminar={() => { setTour(false); guardar('codemind.tour-visto', '1'); }} />
      )}
      {atajos && <Atajos alCerrar={() => setAtajos(false)} />}
      {novedades && (
        <Novedades
          desde={novedades.desde}
          alCerrar={() => { setNovedades(null); guardar('codemind.version-vista', VERSION); }}
        />
      )}
    </>
  );
}
