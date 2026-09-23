// git invoca este script cuando necesita credenciales. Recibe el texto del
// prompt como argumento y espera la respuesta por la salida estandar.
// El token llega por variable de entorno, nunca por la linea de comandos:
// los argumentos de un proceso son visibles para el resto del sistema.
const prompt = String(process.argv[2] || '');
process.stdout.write(/username/i.test(prompt) ? 'x-access-token' : String(process.env.CODEMIND_GH_TOKEN || ''));
