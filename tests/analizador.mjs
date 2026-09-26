import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { analyzeFile } = await import(pathToFileURL(path.join(raiz, 'web/src/lib/analyzer/index.ts')).href);

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Tienda</title>
  <style>
    :root { --color-principal: #5b8cff; --espacio: 12px; }
    .tarjeta { border-radius: 8px; padding: 12px; background: #fff; }
    .tarjeta:hover { transform: scale(1.02); }
    @media (max-width: 700px) {
      .tarjeta { padding: 6px; }
    }
    @keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
  </style>
</head>
<body>
  <header id="cabecera">
    <nav class="menu">
      <ul><li><a href="#inicio">Inicio</a></li></ul>
    </nav>
  </header>

  <main>
    <section id="catalogo">
      <h1>Nuestros productos</h1>
      <table id="tabla-precios"></table>
    </section>

    <form id="contacto" action="/enviar">
      <button onclick="enviarFormulario(event)">Enviar</button>
    </form>
  </main>

  <mi-componente dato="1"></mi-componente>

  <script>
    const IVA = 0.19;
    const CONFIG = { moneda: 'COP', decimales: 2 };

    class Carrito {
      constructor() { this.items = []; }
      agregar(item) { this.items.push(item); }
    }

    function calcularTotal(productos) {
      return productos.reduce((t, p) => t + p.precio, 0) * (1 + IVA);
    }

    const formatear = (v) => v.toFixed(CONFIG.decimales);

    function enviarFormulario(evento) { evento.preventDefault(); }
  </script>
</body>
</html>`;

const ts = `export interface Producto { id: string; precio: number; }
export type Moneda = 'COP' | 'USD';
export enum Estado { Activo, Inactivo }
export const TASAS = { COP: 1, USD: 4000 };
export class Repositorio {
  private items: Producto[] = [];
  buscar(id: string) { return this.items.find((i) => i.id === id); }
}
export function useCarrito() { return null; }
export function Tarjeta() { return <div className="t" />; }
`;

const css = `.boton { color: red; padding: 4px; }
#principal { display: grid; }
@media print { .boton { display: none; } }
`;

const md = `# Guía del proyecto
Texto de introducción.
## Instalación
Pasos.
### Requisitos
Node 24.
## Uso
Más texto.
`;

const mostrar = (titulo, res) => {
  console.log(`\n=== ${titulo} — ${res.symbols.length} elementos${res.error ? ' (error: ' + res.error.slice(0, 50) + ')' : ''}`);
  const porCat = {};
  for (const s of res.symbols) (porCat[s.category] ??= []).push(s);
  for (const [cat, lista] of Object.entries(porCat)) {
    console.log(`  [${cat}] ${lista.length}`);
    for (const s of lista) {
      console.log(`    L${String(s.line).padStart(3)}  ${s.kind.padEnd(24)} ${s.qualifiedName}${s.detail ? '  — ' + s.detail.slice(0, 48) : ''}`);
    }
  }
};

mostrar('index.html (estructura + script + estilo)', analyzeFile('index.html', html));
mostrar('tienda.tsx', analyzeFile('tienda.tsx', ts));
mostrar('estilos.css', analyzeFile('css/estilos.css', css));
mostrar('GUIA.md', analyzeFile('docs/GUIA.md', md));

// Comprobaciones duras
const h = analyzeFile('index.html', html);
const fallos = [];
const tiene = (k, n) => h.symbols.some((s) => s.kind === k && s.qualifiedName === n);
if (!tiene('funcion', 'calcularTotal')) fallos.push('no detecto calcularTotal dentro del <script>');
if (!tiene('clase', 'Carrito')) fallos.push('no detecto la clase Carrito');
if (!tiene('regla CSS', '.tarjeta')) fallos.push('no detecto la regla .tarjeta del <style>');
if (!tiene('variable CSS', '--color-principal')) fallos.push('no detecto la variable CSS');
if (!tiene('consulta de medios', '@media (max-width: 700px)')) fallos.push('no detecto la media query');
if (!h.symbols.some((s) => s.kind === 'manejador en linea')) fallos.push('no detecto el onclick en linea');
if (!tiene('seccion', '#catalogo')) fallos.push('no detecto la seccion con id');
if (!tiene('tabla', '#tabla-precios')) fallos.push('no detecto la tabla con id');
if (!tiene('componente personalizado', 'mi-componente')) fallos.push('no detecto el componente personalizado');

// Las lineas del script deben apuntar al sitio real del archivo
const ct = h.symbols.find((s) => s.qualifiedName === 'calcularTotal');
const lineaReal = html.split('\n').findIndex((l) => l.includes('function calcularTotal')) + 1;
if (ct.line !== lineaReal) fallos.push(`linea mal calculada: dice ${ct.line}, es ${lineaReal}`);

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log(`  Todo correcto. calcularTotal esta en la linea ${ct.line}, que es la real del archivo completo.`);
