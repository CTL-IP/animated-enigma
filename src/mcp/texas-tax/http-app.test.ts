// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTexasTaxHttpServer } from './http-app';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createTexasTaxHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

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

  it('answers two clients independently — it keeps no session', async () => {
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
