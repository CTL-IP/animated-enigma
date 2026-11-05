import { describe, expect, it } from 'vitest';
import { PayPalApiError, type PayPalClient } from './client';
import type { ReadyConnection } from './connection';
import type { LedgerOp, PayPalFetchedInvoice, WebhookHeaders } from './paypal-core';
import { handlePayPalWebhook, type InvoiceRef, type WebhookDeps } from './webhook';

const headers: WebhookHeaders = {
  transmissionId: 't',
  transmissionTime: '2026-11-06T00:00:00Z',
  transmissionSig: 's',
  certUrl: 'https://api.paypal.com/c',
  authAlgo: 'SHA256withRSA',
};

const invoiceRef: InvoiceRef = {
  id: 'inv-uuid',
  organizationId: 'org-a',
  projectId: 'proj',
  clientId: 'client',
  invoiceNumber: 'INV-1',
  status: 'sent',
};

const paidInvoice: PayPalFetchedInvoice = {
  id: 'INV2-A',
  status: 'PAID',
  payments: {
    transactions: [
      {
        type: 'PAYPAL',
        payment_id: 'TX1',
        payment_date: '2026-11-06',
        method: 'CREDIT_CARD',
        amount: { currency_code: 'USD', value: '1250.00' },
      },
    ],
  },
};

const refundedInvoice: PayPalFetchedInvoice = {
  id: 'INV2-A',
  status: 'REFUNDED',
  refunds: {
    transactions: [
      {
        type: 'PAYPAL',
        refund_id: 'RF1',
        refund_date: '2026-11-07',
        amount: { currency_code: 'USD', value: '1250.00' },
      },
    ],
  },
};

function event(type: string, resourceId: string | null = 'INV2-A', id = 'WH-1'): string {
  return JSON.stringify({ id, event_type: type, resource: resourceId ? { id: resourceId } : {} });
}

function fakeConnection(
  fetched: PayPalFetchedInvoice,
  verified = true,
  opts: { getInvoiceThrows?: Error } = {},
): ReadyConnection {
  const client = {
    getInvoice: async () => {
      if (opts.getInvoiceThrows) throw opts.getInvoiceThrows;
      return fetched;
    },
    verifyWebhookSignature: async () => verified,
  } as unknown as PayPalClient;
  return { organizationId: 'org-a', environment: 'sandbox', client, webhookId: 'W1', webhookUrl: 'https://x' };
}

function fakeDeps(overrides: Partial<WebhookDeps> = {}) {
  const calls = {
    applyOps: [] as { invoice: InvoiceRef; ops: LedgerOp[] }[],
    clearPayUrl: [] as string[],
  };
  const deps: WebhookDeps = {
    findInvoice: async () => invoiceRef,
    connectionFor: async () => fakeConnection(paidInvoice),
    knownExternalIds: async () => new Set<string>(),
    applyOps: async (invoice, ops) => {
      calls.applyOps.push({ invoice, ops });
      return {
        written: ops.filter((op) => op.kind !== 'skip').length,
        skipped: ops.filter((op) => op.kind === 'skip').length,
      };
    },
    clearPayUrl: async (invoiceId) => {
      calls.clearPayUrl.push(invoiceId);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('handlePayPalWebhook', () => {
  it('rejects a request with no PayPal headers', async () => {
    const { deps } = fakeDeps();
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), null, deps)).toEqual({
      status: 400,
      handled: false,
      note: 'missing PayPal headers',
    });
  });

  it('answers 400 to a body that is not JSON', async () => {
    const { deps } = fakeDeps();
    expect(await handlePayPalWebhook('not json', headers, deps)).toEqual({
      status: 400,
      handled: false,
      note: 'unreadable body',
    });
  });

  it('answers 400 to an event that names no invoice', async () => {
    const { deps } = fakeDeps();
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID', null), headers, deps)).toEqual({
      status: 400,
      handled: false,
      note: 'no invoice id in event',
    });
  });

  it('answers 200 and does nothing for an invoice that is not ours', async () => {
    const { deps, calls } = fakeDeps({ findInvoice: async () => null });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 200,
      handled: false,
      note: 'not ours',
    });
    expect(calls.applyOps).toHaveLength(0);
  });

  it('ignores an event type it does not act on, before verifying anything', async () => {
    const { deps, calls } = fakeDeps({
      connectionFor: async () => {
        throw new Error('should not be reached');
      },
    });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.SENT'), headers, deps)).toEqual({
      status: 200,
      handled: false,
      note: 'ignored INVOICING.INVOICE.SENT',
    });
    expect(calls.applyOps).toHaveLength(0);
  });

  it('answers 200 and logs when the organization has disconnected PayPal', async () => {
    const { deps } = fakeDeps({ connectionFor: async () => null });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 200,
      handled: false,
      note: 'no live connection',
    });
  });

  it('rejects a signature PayPal does not verify', async () => {
    const { deps, calls } = fakeDeps({ connectionFor: async () => fakeConnection(paidInvoice, false) });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 400,
      handled: false,
      note: 'signature rejected',
    });
    expect(calls.applyOps).toHaveLength(0);
  });

  it('writes one payment for a paid invoice', async () => {
    const { deps, calls } = fakeDeps();
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 200,
      handled: true,
      note: 'wrote 1, skipped 0',
    });
    expect(calls.applyOps[0]?.invoice.id).toBe('inv-uuid');
    expect(calls.applyOps[0]?.ops).toEqual([
      {
        kind: 'payment',
        externalId: 'TX1',
        amount: 1250,
        method: 'card',
        paymentDate: '2026-11-06',
        notes: 'PayPal invoice INV2-A',
      },
    ]);
  });

  it('writes nothing the second time the same event arrives', async () => {
    const { deps } = fakeDeps({ knownExternalIds: async () => new Set(['TX1']) });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 200,
      handled: true,
      note: 'wrote 0, skipped 1',
    });
  });

  it('writes a refund op for a refunded invoice', async () => {
    const { deps, calls } = fakeDeps({ connectionFor: async () => fakeConnection(refundedInvoice) });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.REFUNDED'), headers, deps)).toEqual({
      status: 200,
      handled: true,
      note: 'wrote 1, skipped 0',
    });
    expect(calls.applyOps[0]?.ops[0]?.kind).toBe('refund');
  });

  it('clears the pay link on cancellation and leaves the ledger alone', async () => {
    const { deps, calls } = fakeDeps({
      connectionFor: async () => fakeConnection({ id: 'INV2-A', status: 'CANCELLED' }),
    });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.CANCELLED', 'INV2-A', 'WH-2'), headers, deps)).toEqual({
      status: 200,
      handled: true,
      note: 'pay link cleared',
    });
    expect(calls.clearPayUrl).toEqual(['inv-uuid']);
    expect(calls.applyOps).toHaveLength(0);
  });

  it('throws when PayPal cannot be reached, so PayPal retries', async () => {
    const { deps } = fakeDeps({
      connectionFor: async () =>
        fakeConnection(paidInvoice, true, { getInvoiceThrows: new PayPalApiError(503, {}, 'getInvoice') }),
    });
    await expect(handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).rejects.toBeInstanceOf(
      PayPalApiError,
    );
  });

  it('answers 200 to a permanent PayPal refusal so it is not retried for three days', async () => {
    const { deps, calls } = fakeDeps({
      connectionFor: async () =>
        fakeConnection(paidInvoice, true, { getInvoiceThrows: new PayPalApiError(404, {}, 'getInvoice') }),
    });
    expect(await handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).toEqual({
      status: 200,
      handled: false,
      note: 'permanent: 404',
    });
    expect(calls.applyOps).toHaveLength(0);
  });

  it('lets a database failure propagate, so PayPal retries', async () => {
    const { deps } = fakeDeps({
      applyOps: async () => {
        throw new Error('connection reset');
      },
    });
    await expect(handlePayPalWebhook(event('INVOICING.INVOICE.PAID'), headers, deps)).rejects.toThrow(
      'connection reset',
    );
  });
});
