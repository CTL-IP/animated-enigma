import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  PAYPAL_API_BASE,
  type PayPalEnvironment,
  type PayPalFetchedInvoice,
  type PayPalInvoiceBody,
  type WebhookHeaders,
} from './paypal-core';

/**
 * The only module that talks to PayPal. Everything above it works in the
 * core's plain values; everything PayPal-shaped stays below this line, so the
 * day PayPal renames a field there is one file to open.
 *
 * Plain `fetch`, no SDK: PayPal's server SDK does not cover Invoicing well,
 * and the four calls the app makes are simpler to read as HTTP than through a
 * wrapper. The secret arrives here already decrypted (connection.ts does
 * that); this file never sees ciphertext and never logs what it holds.
 */

export class PayPalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly operation: string,
  ) {
    super(`PayPal ${operation} failed with ${status}`);
    this.name = 'PayPalApiError';
  }
}

/** The slice of `fetch` the client uses — narrow so a test can hand in a fake. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface PayPalClientConfig {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export interface PayPalClient {
  token(): Promise<string>;
  createInvoice(body: PayPalInvoiceBody): Promise<PayPalFetchedInvoice>;
  deleteInvoice(id: string): Promise<void>;
  sendInvoice(id: string): Promise<void>;
  cancelInvoice(id: string): Promise<void>;
  getInvoice(id: string): Promise<PayPalFetchedInvoice>;
  listWebhooks(): Promise<{ id: string; url: string }[]>;
  createWebhook(url: string, eventTypes: readonly string[]): Promise<{ id: string }>;
  verifyWebhookSignature(args: {
    headers: WebhookHeaders;
    webhookId: string;
    rawBody: string;
  }): Promise<boolean>;
}

/** Refresh a token this close to its expiry rather than risk a call failing on it. */
const TOKEN_MARGIN_MS = 60_000;

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function createPayPalClient(config: PayPalClientConfig): PayPalClient {
  const base = PAYPAL_API_BASE[config.environment];
  const fetchImpl: FetchLike = config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const now = config.now ?? (() => new Date());
  let cached: { token: string; expiresAt: number } | null = null;

  async function token(): Promise<string> {
    if (cached && cached.expiresAt - now().getTime() > TOKEN_MARGIN_MS) return cached.token;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const body = parseJson(await res.text());
    if (res.status < 200 || res.status >= 300) throw new PayPalApiError(res.status, body, 'token');
    const record = asRecord(body);
    const access = typeof record.access_token === 'string' ? record.access_token : '';
    const expiresIn = Number(record.expires_in);
    if (!access) throw new PayPalApiError(res.status, body, 'token');
    cached = {
      token: access,
      expiresAt: now().getTime() + (Number.isFinite(expiresIn) ? expiresIn : 0) * 1000,
    };
    return access;
  }

  /**
   * One request with the bearer token. A `PayPal-Request-Id` goes on every
   * call so a network retry of a create cannot make two invoices; PayPal
   * treats a repeated id as the same request.
   */
  async function request(
    operation: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: string,
  ): Promise<unknown> {
    const bearer = await token();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'PayPal-Request-Id': randomUUID(),
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${base}${path}`, { method, headers, body });
    const parsed = parseJson(await res.text());
    if (res.status < 200 || res.status >= 300) {
      throw new PayPalApiError(res.status, parsed, operation);
    }
    return parsed;
  }

  return {
    token,

    async createInvoice(body) {
      return (await request('createInvoice', 'POST', '/v2/invoicing/invoices', JSON.stringify(body))) as PayPalFetchedInvoice;
    },

    async deleteInvoice(id) {
      await request('deleteInvoice', 'DELETE', `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
    },

    async sendInvoice(id) {
      await request(
        'sendInvoice',
        'POST',
        `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`,
        JSON.stringify({ send_to_recipient: true, send_to_invoicer: true }),
      );
    },

    async cancelInvoice(id) {
      await request(
        'cancelInvoice',
        'POST',
        `/v2/invoicing/invoices/${encodeURIComponent(id)}/cancel`,
        JSON.stringify({ send_to_recipient: false, send_to_invoicer: false }),
      );
    },

    async getInvoice(id) {
      return (await request('getInvoice', 'GET', `/v2/invoicing/invoices/${encodeURIComponent(id)}`)) as PayPalFetchedInvoice;
    },

    async listWebhooks() {
      const body = asRecord(await request('listWebhooks', 'GET', '/v1/notifications/webhooks'));
      const hooks = Array.isArray(body.webhooks) ? body.webhooks : [];
      return hooks
        .map((h) => asRecord(h))
        .filter((h) => typeof h.id === 'string' && typeof h.url === 'string')
        .map((h) => ({ id: h.id as string, url: h.url as string }));
    },

    async createWebhook(url, eventTypes) {
      const body = asRecord(
        await request(
          'createWebhook',
          'POST',
          '/v1/notifications/webhooks',
          JSON.stringify({ url, event_types: eventTypes.map((name) => ({ name })) }),
        ),
      );
      if (typeof body.id !== 'string') throw new PayPalApiError(200, body, 'createWebhook');
      return { id: body.id };
    },

    async verifyWebhookSignature({ headers, webhookId, rawBody }) {
      // Built by hand so `webhook_event` is the exact bytes PayPal signed. A
      // parse-and-restringify can reorder or reformat them, and the signature
      // covers the original.
      const body =
        '{"auth_algo":' + JSON.stringify(headers.authAlgo) +
        ',"cert_url":' + JSON.stringify(headers.certUrl) +
        ',"transmission_id":' + JSON.stringify(headers.transmissionId) +
        ',"transmission_sig":' + JSON.stringify(headers.transmissionSig) +
        ',"transmission_time":' + JSON.stringify(headers.transmissionTime) +
        ',"webhook_id":' + JSON.stringify(webhookId) +
        ',"webhook_event":' + rawBody +
        '}';
      const result = asRecord(
        await request('verifyWebhookSignature', 'POST', '/v1/notifications/verify-webhook-signature', body),
      );
      return result.verification_status === 'SUCCESS';
    },
  };
}
