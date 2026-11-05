import { describe, expect, it } from 'vitest';
import { PayPalApiError, createPayPalClient, type PayPalClientConfig } from './client';
import type { PayPalInvoiceBody } from './paypal-core';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** A fetch that answers from a queue and remembers what it was asked. */
function fakeFetch(queue: { status: number; body?: unknown; raw?: string }[]) {
  const calls: Call[] = [];
  const fetchImpl: PayPalClientConfig['fetchImpl'] = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      ),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch of ${String(url)}`);
    const text = next.raw ?? (next.body === undefined ? '' : JSON.stringify(next.body));
    return { status: next.status, text: async () => text };
  };
  return { calls, fetchImpl };
}

const token = { status: 200, body: { access_token: 'T', expires_in: 3600 } };
const draft = { status: 201, body: { id: 'INV2-1', status: 'DRAFT' } };
const body = { detail: { invoice_number: 'INV-1' } } as unknown as PayPalInvoiceBody;

function client(queue: Parameters<typeof fakeFetch>[0], extra: Partial<PayPalClientConfig> = {}) {
  const fake = fakeFetch(queue);
  const c = createPayPalClient({
    environment: 'sandbox',
    clientId: 'cid',
    clientSecret: 'sec',
    fetchImpl: fake.fetchImpl,
    now: () => new Date('2026-11-05T12:00:00Z'),
    ...extra,
  });
  return { c, calls: fake.calls };
}

describe('createPayPalClient', () => {
  it('fetches a token with basic auth against the environment base and reuses it', async () => {
    const { c, calls } = client([token, draft, draft]);
    await c.createInvoice(body);
    await c.createInvoice(body);
    expect(calls[0]?.url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(calls[0]?.headers.Authorization).toBe('Basic ' + Buffer.from('cid:sec').toString('base64'));
    expect(calls[0]?.body).toBe('grant_type=client_credentials');
    expect(calls[1]?.url).toBe('https://api-m.sandbox.paypal.com/v2/invoicing/invoices');
    expect(calls[1]?.headers.Authorization).toBe('Bearer T');
    expect(calls[1]?.headers['PayPal-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls).toHaveLength(3);
  });

  it('uses the live base for the live environment', async () => {
    const { c, calls } = client([token, draft], { environment: 'live' });
    await c.createInvoice(body);
    expect(calls[0]?.url.startsWith('https://api-m.paypal.com/')).toBe(true);
  });

  it('refreshes the token inside the last minute of its life', async () => {
    const short = { status: 200, body: { access_token: 'T1', expires_in: 30 } };
    const { c, calls } = client([short, draft, token, draft]);
    await c.createInvoice(body);
    await c.createInvoice(body);
    expect(calls).toHaveLength(4);
    expect(calls[2]?.url.endsWith('/v1/oauth2/token')).toBe(true);
  });

  it('sends with recipient and invoicer copies', async () => {
    const { c, calls } = client([token, { status: 202, body: {} }]);
    await c.sendInvoice('INV2-1');
    expect(calls[1]?.url.endsWith('/v2/invoicing/invoices/INV2-1/send')).toBe(true);
    expect(calls[1]?.method).toBe('POST');
    expect(JSON.parse(calls[1]?.body ?? '')).toEqual({ send_to_recipient: true, send_to_invoicer: true });
  });

  it('cancels without emailing anyone, and deletes a draft', async () => {
    const { c, calls } = client([token, { status: 204 }, { status: 204 }]);
    await c.cancelInvoice('INV2-1');
    await c.deleteInvoice('INV2-2');
    expect(calls[1]?.url.endsWith('/v2/invoicing/invoices/INV2-1/cancel')).toBe(true);
    expect(JSON.parse(calls[1]?.body ?? '')).toEqual({ send_to_recipient: false, send_to_invoicer: false });
    expect(calls[2]?.method).toBe('DELETE');
    expect(calls[2]?.url.endsWith('/v2/invoicing/invoices/INV2-2')).toBe(true);
  });

  it('reads an invoice back', async () => {
    const fetched = { id: 'INV2-1', status: 'SENT', detail: { metadata: { recipient_view_url: 'https://www.paypal.com/invoice/p/x' } } };
    const { c, calls } = client([token, { status: 200, body: fetched }]);
    expect(await c.getInvoice('INV2-1')).toEqual(fetched);
    expect(calls[1]?.method).toBe('GET');
  });

  it('throws PayPalApiError with the status, body and operation on a non-2xx', async () => {
    const { c } = client([token, { status: 422, body: { name: 'UNPROCESSABLE_ENTITY' } }]);
    const err = await c.createInvoice(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalApiError);
    expect((err as PayPalApiError).status).toBe(422);
    expect((err as PayPalApiError).operation).toBe('createInvoice');
    expect((err as PayPalApiError).body).toEqual({ name: 'UNPROCESSABLE_ENTITY' });
  });

  it('throws PayPalApiError when the token itself is refused', async () => {
    const { c } = client([{ status: 401, body: { error: 'invalid_client' } }]);
    const err = await c.token().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalApiError);
    expect((err as PayPalApiError).status).toBe(401);
    expect((err as PayPalApiError).operation).toBe('token');
  });

  it('posts the raw body back verbatim when verifying', async () => {
    const rawBody = '{"id":"WH-1","resource":{"id":"INV2-1"}}';
    const headers = {
      transmissionId: 'tid',
      transmissionTime: '2026-11-06T00:00:00Z',
      transmissionSig: 'sig',
      certUrl: 'https://api.paypal.com/cert',
      authAlgo: 'SHA256withRSA',
    };
    const { c, calls } = client([
      token,
      { status: 200, body: { verification_status: 'SUCCESS' } },
      { status: 200, body: { verification_status: 'FAILURE' } },
    ]);
    expect(await c.verifyWebhookSignature({ headers, webhookId: 'W1', rawBody })).toBe(true);
    expect(calls[1]?.url.endsWith('/v1/notifications/verify-webhook-signature')).toBe(true);
    expect(calls[1]?.body).toContain('"webhook_event":{"id":"WH-1","resource":{"id":"INV2-1"}}');
    expect(JSON.parse(calls[1]?.body ?? '')).toMatchObject({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.paypal.com/cert',
      transmission_id: 'tid',
      transmission_sig: 'sig',
      transmission_time: '2026-11-06T00:00:00Z',
      webhook_id: 'W1',
    });
    expect(await c.verifyWebhookSignature({ headers, webhookId: 'W1', rawBody })).toBe(false);
  });

  it('lists webhooks as id and url pairs, and creates one', async () => {
    const { c, calls } = client([
      token,
      { status: 200, body: { webhooks: [{ id: 'W1', url: 'https://x/api/webhooks/paypal', event_types: [] }] } },
      { status: 201, body: { id: 'W2', url: 'https://y/api/webhooks/paypal' } },
    ]);
    expect(await c.listWebhooks()).toEqual([{ id: 'W1', url: 'https://x/api/webhooks/paypal' }]);
    expect(await c.createWebhook('https://y/api/webhooks/paypal', ['INVOICING.INVOICE.PAID'])).toEqual({ id: 'W2' });
    expect(JSON.parse(calls[2]?.body ?? '')).toEqual({
      url: 'https://y/api/webhooks/paypal',
      event_types: [{ name: 'INVOICING.INVOICE.PAID' }],
    });
  });
});
