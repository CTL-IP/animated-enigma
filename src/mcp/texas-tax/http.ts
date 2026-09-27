/**
 * Runs the Texas tax MCP server over HTTP: `pnpm exec tsx src/mcp/texas-tax/http.ts`.
 *
 * Binds to 127.0.0.1 unless HOST says otherwise, so running it on a laptop
 * doesn't put it on the network by accident; a host that terminates HTTPS in
 * front of it sets HOST=0.0.0.0 and PORT, and lists the public hostname it
 * answers to in MCP_ALLOWED_HOSTS (comma-separated, no ports).
 */

import { LOCAL_HOSTNAMES, MCP_PATH, createTexasTaxHttpServer } from './http-app';

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? '127.0.0.1';
const allowedHostnames = (process.env.MCP_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  process.stderr.write(`PORT must be a port number, got “${process.env.PORT}”.\n`);
  process.exit(1);
}
const withPort = allowedHostnames.find((h) => /:\d+$/.test(h) && !h.endsWith(']'));
if (withPort) {
  process.stderr.write(`MCP_ALLOWED_HOSTS takes hostnames without ports, got “${withPort}”.\n`);
  process.exit(1);
}

createTexasTaxHttpServer({ allowedHostnames }).listen(port, host, () => {
  process.stderr.write(`texas-tax MCP server listening on http://${host}:${port}${MCP_PATH}\n`);
  process.stderr.write(`Answers to: ${[...LOCAL_HOSTNAMES, ...allowedHostnames].join(', ')}\n`);
  if (!LOCAL_HOSTNAMES.includes(host) && allowedHostnames.length === 0) {
    process.stderr.write(
      `Listening on ${host}, but only loopback Host headers are accepted. Set MCP_ALLOWED_HOSTS to the public hostname.\n`,
    );
  }
});
