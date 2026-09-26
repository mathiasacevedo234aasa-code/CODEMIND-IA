import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { TerminalDisponibilidad, TerminalSesion } from '../lib/types';
import { Icon } from './Icon';

/**
 * Consola del proyecto.
 *
 * Es el intérprete real del equipo, abierto en la carpeta del proyecto. Lo que
 * se escribe va al proceso y lo que el proceso saca se dibuja aquí tal cual,
 * con sus colores. No hay lista de comandos permitidos: una consola que solo
 * deja escribir ciertas cosas no es una consola.
 *
 * La salida se pide al backend cada poco en lugar de por un socket, que es
 * como funcionan ya los procesos del panel de ejecución. Para escribir a mano
 * es de sobra, y evita una vía de conexión más en una aplicación que solo
 * escucha en la propia máquina.
 */

const INTERVALO_MS = 120;

const TEMA_OSCURO = {
  background: '#11141b', foreground: '#d7dce5', cursor: '#5b8cff',
  selectionBackground: '#2a3550',
  black: '#11141b', red: '#e06c75', green: '#8dc891', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dce5',
};

const TEMA_CLARO = {
  background: '#ffffff', foreground: '#22262e', cursor: '#2f6bd8',
  selectionBackground: '#cfe0ff',
  black: '#22262e', red: '#c4433d', green: '#357a38', yellow: '#96690a',
  blue: '#2f6bd8', magenta: '#8a3fbf', cyan: '#0e7490', white: '#22262e',
};

export function TerminalPanel() {
  const project = useStore((s) => s.project);
  const temaOscuro = useStore((s) => s.settings.editor.theme === 'dark');

  const contenedor = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const sesionRef = useRef<string | null>(null);
  const seq = useRef(0);

  const [disponible, setDisponible] = useState<TerminalDisponibilidad | null>(null);
  const [sesion, setSesion] = useState<TerminalSesion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    api.terminalDisponible().then(setDisponible).catch((e: Error) => setError(e.message));
  }, []);

  // --- creación del terminal visual, una sola vez mientras el panel viva
  useEffect(() => {
    if (!contenedor.current || term.current) return;
    const t = new Terminal({
      fontSize: 12.5,
      fontFamily: 'var(--mono), Consolas, "Cascadia Mono", monospace',
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: temaOscuro ? TEMA_OSCURO : TEMA_CLARO,
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(contenedor.current);
    f.fit();
    term.current = t;
    fit.current = f;

    // Cada tecla va al proceso; el eco lo devuelve el propio intérprete.
    t.onData((datos) => {
      const sid = sesionRef.current;
      if (!project || !sid) return;
      void api.terminalEscribir(project.id, sid, datos).catch((e: Error) => setError(e.message));
    });

    const alRedimensionar = () => {
      try {
        f.fit();
      } catch {
        /* el panel está oculto: no hay tamaño que calcular */
      }
      const sid = sesionRef.current;
      if (project && sid) void api.terminalTamano(project.id, sid, t.cols, t.rows).catch(() => {});
    };
    const observador = new ResizeObserver(alRedimensionar);
    observador.observe(contenedor.current);

    return () => {
      observador.disconnect();
      t.dispose();
      term.current = null;
      fit.current = null;
    };
    // El terminal visual no se recrea al cambiar de tema: eso se ajusta aparte.
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (term.current) term.current.options.theme = temaOscuro ? TEMA_OSCURO : TEMA_CLARO;
  }, [temaOscuro]);

  // --- lectura continua de la salida
  useEffect(() => {
    if (!project || !sesion || sesion.estado !== 'viva') return;
    let vivo = true;

    const tick = async () => {
      if (!vivo) return;
      try {
        const res = await api.terminalLeer(project.id, sesion.id, seq.current);
        if (!vivo) return;
        if (res.recortado) term.current?.write('\r\n\x1b[2m[...salida antigua descartada...]\x1b[0m\r\n');
        for (const trozo of res.trozos) {
          term.current?.write(trozo.texto);
          seq.current = trozo.seq;
        }
        if (res.sesion.estado !== sesion.estado) setSesion(res.sesion);
      } catch (e) {
        if (vivo) setError((e as Error).message);
        return;
      }
      if (vivo) temporizador = window.setTimeout(tick, INTERVALO_MS);
    };

    let temporizador = window.setTimeout(tick, 0);
    return () => { vivo = false; window.clearTimeout(temporizador); };
  }, [project, sesion]);

  const abrir = async () => {
    if (!project || !term.current) return;
    setAbriendo(true);
    setError(null);
    try {
      fit.current?.fit();
      const { sesion: nueva } = await api.terminalAbrir(project.id, term.current.cols, term.current.rows);
      seq.current = 0;
      term.current.clear();
      sesionRef.current = nueva.id;
      setSesion(nueva);
      term.current.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAbriendo(false);
    }
  };

  const cerrar = async () => {
    if (!project || !sesion) return;
    await api.terminalCerrar(project.id, sesion.id).catch(() => {});
    sesionRef.current = null;
    setSesion(null);
    term.current?.clear();
  };

  const interrumpir = async () => {
    if (!project || !sesion) return;
    await api.terminalInterrumpir(project.id, sesion.id).catch((e: Error) => setError(e.message));
    term.current?.focus();
  };

  if (!project) return <p className="hint" style={{ padding: 12 }}>Abre un proyecto para usar la consola.</p>;

  return (
    <div className="consola">
      <div className="consola-barra">
        {sesion ? (
          <>
            <span className={`tag ${sesion.estado === 'viva' ? 'ok' : 'muted'}`}>
              {sesion.estado === 'viva' ? sesion.shell : 'Cerrada'}
            </span>
            <code title={sesion.cwd}>{sesion.cwd}</code>
            <span style={{ flex: 1 }} />
            <button className="btn sm outline" onClick={() => void interrumpir()} disabled={sesion.estado !== 'viva'}>
              Interrumpir (Ctrl+C)
            </button>
            <button className="btn sm outline" onClick={() => void cerrar()}>Cerrar</button>
            {sesion.estado !== 'viva' && (
              <button className="btn sm primary" onClick={() => void abrir()}>Abrir otra</button>
            )}
          </>
        ) : (
          <>
            <span className="meta">
              {disponible
                ? `${disponible.shell} en la carpeta del proyecto`
                : 'Comprobando qué intérprete hay en este equipo...'}
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn sm primary" onClick={() => void abrir()} disabled={abriendo || !disponible}>
              {abriendo ? <span className="spinner" /> : <Icon name="terminal" size={12} />} Abrir la consola
            </button>
          </>
        )}
      </div>

      {error && <div className="review-banner" style={{ margin: '8px 10px', borderColor: 'var(--bad)' }}>{error}</div>}

      {disponible?.modo === 'tuberias' && (
        <div className="review-banner" style={{ margin: '8px 10px' }}>
          <strong>Esta consola no tiene terminal.</strong> {disponible.motivo} Los comandos se ejecutan
          igual de verdad, pero no habrá prompt ni se verán bien los programas que dibujan en pantalla.
        </div>
      )}

      <div className="consola-lienzo" ref={contenedor} onClick={() => term.current?.focus()} />

      {!sesion && (
        <p className="hint" style={{ padding: '6px 10px' }}>
          <Icon name="warn" size={12} /> Los comandos se ejecutan en tu equipo con tus permisos, tal
          cual los escribas. CodeMind AI no los revisa, no los completa y no ejecuta nada por su cuenta.
        </p>
      )}
    </div>
  );
}
