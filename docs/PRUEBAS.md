# Pruebas funcionales ejecutadas

Fecha: 20 de septiembre de 2026. Modelo usado: `openai/gpt-oss-120b` (Groq).

Las pruebas 1 a 7 y 11 se ejecutaron contra la API real con un script automatizado; el resto se
comprobó en la interfaz con el navegador.

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Crear un proyecto con HTML, CSS y JS | Correcto | Proyecto creado, árbol `css/`, `js/`, `index.html` escrito en disco |
| 2 | Detectar funciones | Correcto | 5 detectadas: `calcularTotal@6`, `formatearPrecio@17`, `Carrito.constructor@20`, `Carrito.agregar@21`, `Carrito.sincronizar@22` |
| 3 | Documentar una función con Groq | Correcto | Propuesta con propósito, 2 parámetros, 5 pasos de flujo y la dependencia `IVA` |
| 3b | El código original no se modifica | Correcto | Contenido del archivo idéntico byte a byte tras generar la propuesta |
| 3c | La propuesta no entra en lo oficial | Correcto | `approved` vacío mientras la propuesta está pendiente |
| 4 | Aprobar documentación | Correcto | Pasa a `approved`, desaparece de pendientes; comprobado también en la interfaz |
| 5 | Rechazar documentación | Correcto | Tras descartar, la función sigue sin documentación oficial |
| 6 | Modificar una función documentada | Correcto | `calcularTotal` pasa a *Revisar documentación*; el resto de funciones no se ve afectado |
| 7 | Consultar el contexto del proyecto | Correcto | Respuesta basada en la memoria guardada, sin inventar campos ausentes |
| 8 | Reiniciar la aplicación | Correcto | Backend reiniciado tres veces; proyectos, documentación e historial intactos |
| 9 | Conectar Git | Correcto | `init` sobre una carpeta real, clasificación de los 4 archivos, preparar, diff, commit `3c404e9`, historial y ramas; repetido desde la interfaz con el commit `579b602` |
| 10 | Conectar GitHub | Parcial | Formulario, validación del token contra GitHub y vista previa de sincronización funcionan. Sin token configurado la vista previa informa con honestidad (`vinculado=false`, `canPush=false`). La subida real a un repositorio no se ha ejecutado: requiere un token del usuario |
| 11 | Proteger credenciales | Correcto | `gsk_` no aparece en `/api/settings` ni en `/api/health`; `.env` y `server/data/` ignorados por Git |
| 12 | Previsualizar un proyecto y ver sus errores | Correcto | CSS y JS incrustados en el iframe; `console.log` llega a la pestaña Consola y `ReferenceError: noExiste is not defined` a la pestaña Errores |

## Comprobaciones adicionales

- **Regeneración sobre función ya documentada**: la propuesta nueva aparece con el aviso de que
  existe una versión aprobada y que se conservará en el historial. La versión oficial no se toca
  hasta aprobar.
- **Centro de documentación**: las seis secciones (general, arquitectura, funciones, decisiones,
  progreso, historial) renderizan con datos reales del proyecto.
- **Asistente, modo Contexto**: responde "qué me falta por documentar" enumerando el estado real de
  cada función. Antes de recibir el inventario de funciones detectadas respondía que no tenía esa
  información, lo cual era honesto pero inútil; se corrigió pasándole los hechos.
- **Tipado**: `tsc -b` sin errores.

## Incidencias encontradas durante las pruebas

1. **Modelo inexistente**: `llama-3.3-70b-versatile` no está disponible en esta cuenta de Groq. El
   valor por defecto se cambió a `openai/gpt-oss-120b` y el backend ahora explica el error 404 de
   forma comprensible en lugar de propagar el mensaje crudo.
2. **Variable de entorno del sistema**: la máquina tenía un `GROQ_API_KEY` antiguo exportado que
   tapaba el del `.env`, provocando 401. El `.env` del proyecto pasa a tener prioridad.
3. **Modo JSON estricto**: los modelos de razonamiento pueden agotar el presupuesto de tokens antes
   de cerrar el JSON. Se añadió `reasoning_effort: low` para esos modelos, reintento en modo texto
   cuando Groq devuelve `json_validate_failed`, y un mensaje claro cuando la respuesta se corta por
   límite de tokens.
