/**
 * Runs the Texas tax MCP server over HTTP: `pnpm exec tsx src/mcp/texas-tax/http.ts`.
 *
 * Binds to 127.0.0.1 unless HOST says otherwise, so running it on a laptop
 * doesn't put it on the network by accident; a host that terminates HTTPS in
 * front of it sets HOST=0.0.0.0 and PORT.
 */

import { MCP_PATH, createTexasTaxHttpServer } from './http-app';

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  process.stderr.write(`PORT must be a port number, got “${process.env.PORT}”.\n`);
  process.exit(1);
}

createTexasTaxHttpServer().listen(port, host, () => {
  process.stderr.write(`texas-tax MCP server listening on http://${host}:${port}${MCP_PATH}\n`);
});
