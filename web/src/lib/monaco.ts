import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

/**
 * Monaco se sirve desde el paquete local, no desde un CDN.
 *
 * Asi el editor funciona sin conexion y los workers de lenguaje (TypeScript,
 * JSON, CSS, HTML) quedan disponibles, que son los que producen los marcadores
 * de error sintactico dentro del editor.
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

// El codigo del usuario puede usar modulos o globales que Monaco no conoce.
// Diagnosticamos sintaxis, no ausencia de tipos, para no llenar el editor de
// errores falsos en archivos sueltos.
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true,
  jsx: monaco.languages.typescript.JsxEmit.React,
});

// Pistas en línea discretas: el nombre del parámetro al llamar a una función
// y el tipo deducido de las variables. Se ocultan pulsando Ctrl+Alt.
for (const d of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
  d.setInlayHintsOptions({
    includeInlayParameterNameHints: 'literals',
    includeInlayFunctionParameterTypeHints: false,
    includeInlayVariableTypeHints: false,
    includeInlayEnumMemberValueHints: true,
  });
}
