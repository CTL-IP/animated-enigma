/**
 * The Texas tax MCP server over Streamable HTTP — the shape a remote connector
 * needs (claude.ai, Cowork, a phone), where stdio only reaches a local Claude
 * Code session.
 *
 * Stateless, per the SDK's documented pattern: each POST gets a fresh server
 * and transport, so nothing leaks between callers and any number of instances
 * can sit behind a load balancer. There is nothing to authenticate — every
 * tool is read-only over public Comptroller material, the same content this
 * public repository already holds — but hosting it is still an owner decision,
 * so nothing here deploys itself.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTexasTaxServer } from './server';

export const MCP_PATH = '/mcp';

function jsonRpcError(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  const server = createTexasTaxServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

export function createTexasTaxHttpServer(): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (path !== MCP_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found. The MCP endpoint is /mcp.');
      return;
    }
    // Stateless: no server-initiated stream to GET, no session to DELETE.
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      jsonRpcError(res, 405, 'Method not allowed. This server is stateless: POST JSON-RPC to /mcp.');
      return;
    }
    handleMcp(req, res).catch((error: unknown) => {
      process.stderr.write(`texas-tax MCP request failed: ${error instanceof Error ? error.message : String(error)}\n`);
      jsonRpcError(res, 500, 'Internal server error');
    });
  });
}
