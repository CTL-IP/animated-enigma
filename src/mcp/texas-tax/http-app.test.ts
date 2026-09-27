// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { request, type IncomingHttpHeaders, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createTexasTaxHttpServer } from './http-app';

let server: Server;
let port: number;
let base: string;

beforeAll(async () => {
  server = createTexasTaxHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

/** A bare HTTP request, so a test can set the Host header — fetch won't let it. */
function raw(
  toPort: number,
  opts: { method: string; path: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; headers: IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: toPort, method: opts.method, path: opts.path, headers: opts.headers },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

const RPC_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
};

/** The JSON-RPC message in a response, whether it came as JSON or as a server-sent event. */
function rpcMessage(text: string): { result?: { tools?: unknown[] }; error?: { message: string } } {
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .join('');
  return JSON.parse(data || text);
}

const listTools = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the texas-tax MCP server over HTTP', () => {
  it('serves the tools to a real Streamable HTTP client', async () => {
    const client = new Client({ name: 'http-test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(11);
    const result = await client.callTool({ name: 'tx_check_rate', arguments: { ratePercent: 8.25 } });
    expect((result.content as { text: string }[])[0]!.text).toMatch(/^OK:/);
    await client.close();
  });

  it('answers two clients at once', async () => {
    const a = new Client({ name: 'a', version: '0' });
    const b = new Client({ name: 'b', version: '0' });
    await a.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    await b.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const [ra, rb] = await Promise.all([
      a.callTool({ name: 'tx_vehicle_rental', arguments: { contractDays: 10 } }),
      b.callTool({ name: 'tx_vehicle_rental', arguments: { contractDays: 200 } }),
    ]);
    expect((ra.content as { text: string }[])[0]!.text).toMatch(/10%/);
    expect((rb.content as { text: string }[])[0]!.text).toMatch(/operating lease/);
    await Promise.all([a.close(), b.close()]);
  });

  it('keeps no session: issues no session id, needs none, and ignores a stale one', async () => {
    const init = await raw(port, {
      method: 'POST',
      path: '/mcp',
      headers: RPC_HEADERS,
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
      },
    });
    expect(init.status).toBe(200);
    expect(init.headers['mcp-session-id']).toBeUndefined();

    // A stateful server refuses both of these: 400 before initialize, 404 for an unknown session.
    const variants: Record<string, string>[] = [{}, { 'mcp-session-id': 'stale-session' }];
    for (const extra of variants) {
      const list = await raw(port, { method: 'POST', path: '/mcp', headers: { ...RPC_HEADERS, ...extra }, body: listTools });
      expect(list.status).toBe(200);
      expect(rpcMessage(list.text).result?.tools).toHaveLength(11);
    }
  });

  it('refuses a Host it does not answer to — the DNS-rebinding shape', async () => {
    const res = await raw(port, {
      method: 'POST',
      path: '/mcp',
      headers: { ...RPC_HEADERS, host: 'attacker.example' },
      body: listTools,
    });
    expect(res.status).toBe(403);
    expect(rpcMessage(res.text).error?.message).toMatch(/doesn’t answer to attacker\.example/);

    const unreadable = await raw(port, { method: 'GET', path: '/mcp', headers: { host: 'bad host' } });
    expect(unreadable.status).toBe(403);
    expect(rpcMessage(unreadable.text).error?.message).toBe('Missing or unreadable Host header.');

    // A load balancer's health probe names whatever host it likes.
    expect((await raw(port, { method: 'GET', path: '/healthz', headers: { host: 'attacker.example' } })).status).toBe(200);
  });

  it('answers a configured public hostname, with or without a port', async () => {
    const hosted = createTexasTaxHttpServer({ allowedHostnames: ['tax.example.com'] });
    await new Promise<void>((resolve) => hosted.listen(0, '127.0.0.1', resolve));
    const hostedPort = (hosted.address() as AddressInfo).port;
    try {
      // Past the Host check, a GET meets the method check: 405, not 403.
      const status = async (host: string) =>
        (await raw(hostedPort, { method: 'GET', path: '/mcp', headers: { host } })).status;
      expect(await status('tax.example.com')).toBe(405);
      expect(await status('tax.example.com:443')).toBe(405);
      expect(await status('localhost')).toBe(405);
      expect(await status('other.example.com')).toBe(403);
    } finally {
      await new Promise<void>((resolve) => hosted.close(() => resolve()));
    }
  });

  it('refuses GET on /mcp with a JSON-RPC error and an Allow header', async () => {
    const res = await fetch(`${base}/mcp`);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(await res.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
  });

  it('reports healthy, and points strays at /mcp', async () => {
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');
    const stray = await fetch(`${base}/`);
    expect(stray.status).toBe(404);
    expect(await stray.text()).toMatch(/\/mcp/);
  });
});
