import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './store.js';

/**
 * Plantillas de proyecto nuevo.
 *
 * Son pocas y pequenas a proposito: lo justo para arrancar, sin dependencias
 * que no se usen. Nunca se sobrescribe nada: si la carpeta elegida ya tiene
 * un archivo con ese nombre, se deja como esta y se dice.
 */
export const PLANTILLAS = {
  html: {
    nombre: 'Página HTML',
    descripcion: 'HTML, CSS y JavaScript, sin herramientas. Se abre con Vista previa.',
    archivos: {
      'index.html': `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mi página</title>
  <link rel="stylesheet" href="css/estilos.css">
</head>
<body>
  <main>
    <h1>Hola</h1>
    <button id="saludar">Saludar</button>
    <p id="mensaje"></p>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`,
      'css/estilos.css': `body {
  font-family: system-ui, sans-serif;
  margin: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
}
`,
      'js/app.js': `/** Muestra un saludo debajo del botón. */
function saludar() {
  document.getElementById('mensaje').textContent = 'Hola desde JavaScript';
}

document.getElementById('saludar').addEventListener('click', saludar);
`,
    },
  },
  react: {
    nombre: 'React con Vite',
    descripcion: 'Una app de React lista para "npm install" y "npm run dev".',
    archivos: {
      'package.json': `${JSON.stringify({
        name: 'mi-app-react',
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { vite: '^6.0.7', '@vitejs/plugin-react': '^4.3.4' },
      }, null, 2)}\n`,
      'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
`,
      'index.html': `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mi app</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`,
      'src/main.jsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
`,
      'src/App.jsx': `import { useState } from 'react';

/** Un contador: el ejemplo mínimo de estado en React. */
export default function App() {
  const [cuenta, setCuenta] = useState(0);
  return (
    <main>
      <h1>Mi app</h1>
      <button onClick={() => setCuenta((c) => c + 1)}>Pulsado {cuenta} veces</button>
    </main>
  );
}
`,
      'README.md': `# Mi app

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    },
  },
  node: {
    nombre: 'API en Node',
    descripcion: 'Un servidor HTTP con node:http, sin dependencias. "npm start".',
    archivos: {
      'package.json': `${JSON.stringify({
        name: 'mi-api',
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { start: 'node server.js', dev: 'node --watch server.js' },
      }, null, 2)}\n`,
      'server.js': `import http from 'node:http';

const PUERTO = Number(process.env.PORT) || 3000;

/** Responde JSON con el código de estado indicado. */
function enviar(res, estado, datos) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(datos));
}

const servidor = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/salud') return enviar(res, 200, { ok: true });
  enviar(res, 404, { error: 'No encontrado' });
});

servidor.listen(PUERTO, () => console.log(\`API en http://localhost:\${PUERTO}\`));
`,
    },
  },
  python: {
    nombre: 'Script de Python',
    descripcion: 'Un script con su función principal. Se ejecuta con ▷ o F5.',
    archivos: {
      'main.py': `"""Punto de entrada del script."""


def saludar(nombre: str) -> str:
    """Devuelve un saludo para el nombre dado."""
    return f"Hola, {nombre}"


def main() -> None:
    print(saludar("mundo"))


if __name__ == "__main__":
    main()
`,
    },
  },
};

export const listaPlantillas = () =>
  Object.entries(PLANTILLAS).map(([id, p]) => ({ id, nombre: p.nombre, descripcion: p.descripcion, archivos: Object.keys(p.archivos) }));

/** Escribe la plantilla en `base`. Devuelve lo escrito y lo que se dejó porque ya existía. */
export async function aplicar(base, id) {
  const plantilla = PLANTILLAS[id];
  if (!plantilla) throw new HttpError(400, 'Esa plantilla no existe.');
  const escritos = [];
  const respetados = [];
  for (const [rel, contenido] of Object.entries(plantilla.archivos)) {
    const abs = path.join(base, ...rel.split('/'));
    const existe = await fs.stat(abs).then(() => true).catch(() => false);
    if (existe) { respetados.push(rel); continue; }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contenido, { encoding: 'utf8', flag: 'wx' });
    escritos.push(rel);
  }
  return { escritos, respetados };
}
