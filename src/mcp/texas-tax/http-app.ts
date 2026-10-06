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
 *
 * It does check the Host header. Without that, a web page can point a domain
 * it controls at a server on the reader's own machine (DNS rebinding) and
 * talk to it from the browser. The data is public, so the stakes are low, but
 * the fix is a few lines. The SDK deprecates its transport's own check in
 * favour of a front door that does it, so the check lives here.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTexasTaxServer } from './server';

export const MCP_PATH = '/mcp';

/** Always accepted: a request naming the loopback interface came from this machine. */
export const LOCAL_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

export interface TexasTaxHttpOptions {
  /** Public hostnames, without ports, a hosted deployment answers to — added to the loopback names. */
  allowedHostnames?: readonly string[];
}

/** The hostname a Host header names, port dropped; null when there isn't one to read. */
function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

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

export function createTexasTaxHttpServer(options: TexasTaxHttpOptions = {}): Server {
  const allowed = new Set([...LOCAL_HOSTNAMES, ...(options.allowedHostnames ?? [])]);

  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    // A load balancer's health probe names whatever host it likes.
    if (path === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (path !== MCP_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found. The MCP endpoint is /mcp.');
      return;
    }
    const hostname = hostnameOf(req.headers.host);
    if (!hostname || !allowed.has(hostname)) {
      jsonRpcError(
        res,
        403,
        hostname
          ? `This server doesn’t answer to ${hostname}. A hosted deployment lists its hostname in MCP_ALLOWED_HOSTS.`
          : 'Missing or unreadable Host header.',
      );
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
