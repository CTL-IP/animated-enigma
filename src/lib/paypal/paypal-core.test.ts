import { describe, expect, it } from 'vitest';
import { invoiceTotals } from '@/lib/invoices/invoices-core';
import {
  buildInvoiceRequest,
  calendarDateInZone,
  connectionSummary,
  explainPayPalError,
  formatQuantity,
  isPayPalEnvironment,
  isPayPalEvent,
  ledgerOpsFor,
  mapPayPalMethod,
  mapPayPalStatus,
  PAYPAL_API_BASE,
  PAYPAL_EVENTS,
  providerStatus,
  money,
  readWebhookHeaders,
  sendPreconditions,
  totalsAgree,
  type ClientForPayPal,
  type ForemanInvoiceForPayPal,
  type OrgForPayPal,
  type PayPalFetchedInvoice,
  type PayPalInvoiceBody,
  type PayPalInvoiceItem,
} from './paypal-core';

describe('providerStatus', () => {
  it('names the missing key', () => {
    const s = providerStatus({ encryptionKey: null });
    expect(s.configured).toBe(false);
    expect(s.missing).toEqual(['PAYPAL_CREDENTIAL_ENCRYPTION_KEY']);
    expect(s.message).toContain('PAYPAL_CREDENTIAL_ENCRYPTION_KEY');
  });
  it('refuses a key that is not 32 bytes', () => {
    expect(providerStatus({ encryptionKey: 'c2hvcnQ=' }).configured).toBe(false);
  });
  it('is configured with a 32-byte base64 key', () => {
    expect(providerStatus({ encryptionKey: Buffer.alloc(32, 7).toString('base64') }).configured).toBe(
      true,
    );
  });
});

describe('environments and events', () => {
  it('knows the two environments and their API bases', () => {
    expect(isPayPalEnvironment('sandbox')).toBe(true);
    expect(isPayPalEnvironment('live')).toBe(true);
    expect(isPayPalEnvironment('prod')).toBe(false);
    expect(PAYPAL_API_BASE.sandbox).toBe('https://api-m.sandbox.paypal.com');
    expect(PAYPAL_API_BASE.live).toBe('https://api-m.paypal.com');
  });
  it('acts on exactly three event types', () => {
    expect(PAYPAL_EVENTS).toEqual([
      'INVOICING.INVOICE.PAID',
      'INVOICING.INVOICE.REFUNDED',
      'INVOICING.INVOICE.CANCELLED',
    ]);
    expect(isPayPalEvent('INVOICING.INVOICE.PAID')).toBe(true);
    expect(isPayPalEvent('INVOICING.INVOICE.SENT')).toBe(false);
  });
});

describe('maps', () => {
  it('maps PayPal statuses onto the Foreman', () => {
    expect(mapPayPalStatus('SENT')).toBe('sent');
    expect(mapPayPalStatus('UNPAID')).toBe('sent');
    expect(mapPayPalStatus('MARKED_AS_PAID')).toBe('paid');
    expect(mapPayPalStatus('PAYMENT_PENDING')).toBeNull();
    expect(mapPayPalStatus('AUTO_CANCELLED')).toBe('void');
    expect(mapPayPalStatus('nonsense')).toBeNull();
  });
  it('maps payment methods', () => {
    expect(mapPayPalMethod('PAYPAL')).toBe('paypal');
    expect(mapPayPalMethod('DEBIT_CARD')).toBe('card');
    expect(mapPayPalMethod('WIRE_TRANSFER')).toBe('ach');
    expect(mapPayPalMethod(undefined)).toBe('other');
  });
});

describe('readWebhookHeaders', () => {
  it('returns null when a header is missing', () => {
    expect(readWebhookHeaders(() => null)).toBeNull();
  });
  it('reads all five case-insensitively', () => {
    const sent: Record<string, string> = {
      'paypal-transmission-id': 'id',
      'paypal-transmission-time': 't',
      'paypal-transmission-sig': 's',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
    };
    const h = readWebhookHeaders((n) => sent[n.toLowerCase()] ?? null);
    expect(h?.certUrl).toBe('https://api.paypal.com/cert');
    expect(h?.transmissionId).toBe('id');
  });
  it('treats a blank header as missing', () => {
    expect(readWebhookHeaders(() => '  ')).toBeNull();
  });
});

describe('connectionSummary', () => {
  it('is live only while not revoked', () => {
    const row = {
      environment: 'sandbox',
      clientId: 'c',
      webhookId: null,
      webhookUrl: null,
      connectedAt: new Date(2026, 10, 5),
      lastVerifiedAt: null,
      revokedAt: null,
    };
    expect(connectionSummary(row).live).toBe(true);
    expect(connectionSummary(row).webhookRegistered).toBe(false);
    expect(connectionSummary(row).connectedOn).toBe('11/5/2026');
    expect(connectionSummary(row).lastVerifiedOn).toBeNull();
    expect(connectionSummary({ ...row, revokedAt: new Date() }).live).toBe(false);
  });
  it('reads an unknown environment as sandbox, never as live', () => {
    const row = {
      environment: 'weird',
      clientId: 'c',
      webhookId: 'W1',
      webhookUrl: 'https://x/api/webhooks/paypal',
      connectedAt: new Date(2026, 10, 5),
      lastVerifiedAt: new Date(2026, 10, 6),
      revokedAt: null,
    };
    expect(connectionSummary(row).environment).toBe('sandbox');
    expect(connectionSummary(row).webhookRegistered).toBe(true);
    expect(connectionSummary(row).lastVerifiedOn).toBe('11/6/2026');
  });
});

// ── Building the PayPal invoice request ──────────────────────────────────────

const demo = { description: 'Demo and haul-off', quantity: 1, unitPrice: 450, taxable: false };
const tile = { description: 'Tile, 120 sq ft', quantity: '1.5000', unitPrice: '300.00', taxable: true };
const lines = [demo, tile];
const invoice: ForemanInvoiceForPayPal = {
  id: '11111111-2222-4333-8444-555555555555',
  invoiceNumber: 'INV-2026-0031',
  issuedAt: new Date('2026-11-05T03:30:00Z'),
  dueDate: '2026-11-20',
  taxRatePercent: 8.25,
  credits: 50,
  total: invoiceTotals(lines, 8.25, 50).total,
  paymentInstructions: null,
  lines,
};
const org: OrgForPayPal = {
  name: "PT's Tactical Renovations",
  logoUrl: 'https://example.test/logo.png',
  timezone: 'America/Chicago',
};
const client: ClientForPayPal = {
  displayName: 'Mary Ann Lee',
  companyName: null,
  email: '  Mary@Example.com ',
};
const now = new Date('2026-11-05T12:00:00Z');

function item(body: PayPalInvoiceBody, index: number): PayPalInvoiceItem {
  const found = body.items[index];
  if (!found) throw new Error(`no item ${index}`);
  return found;
}

function built(
  inv: ForemanInvoiceForPayPal = invoice,
  o: OrgForPayPal = org,
  c: ClientForPayPal = client,
) {
  const r = buildInvoiceRequest(inv, o, c, now);
  if (!r.ok) throw new Error(r.error);
  return r.body;
}

describe('buildInvoiceRequest', () => {
  it('maps number, dates and terms', () => {
    const body = built();
    expect(body.detail.invoice_number).toBe('INV-2026-0031');
    expect(body.detail.invoice_date).toBe('2026-11-04'); // 03:30Z is still the 4th in Chicago
    expect(body.detail.payment_term).toEqual({
      term_type: 'DUE_ON_DATE_SPECIFIED',
      due_date: '2026-11-20',
    });
    expect(body.detail.memo).toBe(`foreman:${invoice.id}`);
    expect(body.detail.currency_code).toBe('USD');
  });
  it('is due on receipt without a due date', () => {
    expect(built({ ...invoice, dueDate: null }).detail.payment_term).toEqual({
      term_type: 'DUE_ON_RECEIPT',
    });
  });
  it('dates an invoice with no issue timestamp today, in the organization zone', () => {
    expect(built({ ...invoice, issuedAt: null }).detail.invoice_date).toBe('2026-11-05');
  });
  it('taxes only taxable lines, at the invoice rate', () => {
    const body = built();
    expect(item(body, 0).tax).toBeUndefined();
    expect(item(body, 1).tax).toEqual({ name: 'Sales tax', percent: '8.25' });
  });
  it('formats quantities and money as PayPal wants them', () => {
    const body = built();
    expect(item(body, 1).quantity).toBe('1.5');
    expect(item(body, 1).unit_amount).toEqual({ currency_code: 'USD', value: '300.00' });
    expect(item(body, 0).quantity).toBe('1');
    expect(item(body, 0).unit_of_measure).toBe('QUANTITY');
  });
  it('carries a credit as an invoice-level discount', () => {
    expect(built().amount?.breakdown.discount.invoice_discount.amount).toEqual({
      currency_code: 'USD',
      value: '50.00',
    });
  });
  it('omits the discount when there is no credit', () => {
    expect(built({ ...invoice, credits: 0 }).amount).toBeUndefined();
  });
  it('uses the display name for a person and the company name for a company', () => {
    expect(built().primary_recipients[0].billing_info.business_name).toBe('Mary Ann Lee');
    expect(
      built(invoice, org, { ...client, companyName: 'Lee Holdings' }).primary_recipients[0]
        .billing_info.business_name,
    ).toBe('Lee Holdings');
  });
  it('normalises the email', () => {
    expect(built().primary_recipients[0].billing_info.email_address).toBe('mary@example.com');
  });
  it('refuses an unusable email, naming the client', () => {
    expect(buildInvoiceRequest(invoice, org, { ...client, email: 'not-an-email' }, now)).toEqual({
      ok: false,
      error: 'Add a valid email address to Mary Ann Lee first; PayPal sends the invoice to it.',
    });
    expect(buildInvoiceRequest(invoice, org, { ...client, email: null }, now)).toMatchObject({
      ok: false,
    });
  });
  it('refuses a zero quantity, naming the line', () => {
    const bad = { ...invoice, lines: [demo, { ...tile, quantity: 0 }] };
    expect(buildInvoiceRequest(bad, org, client, now)).toEqual({
      ok: false,
      error: 'Line 2 has a quantity of zero. Fix it on the invoice first.',
    });
  });
  it('splits a long description at 200 characters', () => {
    const long = 'x'.repeat(250);
    const body = built({ ...invoice, lines: [{ ...demo, description: long }] });
    expect(item(body, 0).name).toHaveLength(200);
    expect(item(body, 0).description).toBe('x'.repeat(50));
    expect(item(built(), 0).description).toBeUndefined();
  });
  it('fixes the configuration', () => {
    expect(built().configuration).toEqual({
      tax_calculated_after_discount: false,
      tax_inclusive: false,
      allow_tip: false,
      partial_payment: { allow_partial_payment: false },
    });
  });
  it('writes the note, names the business, and sends the logo only over https', () => {
    const body = built();
    expect(body.detail.note).toBe(
      "Invoice INV-2026-0031 from PT's Tactical Renovations. Pay securely with the button below.",
    );
    expect(body.invoicer).toEqual({
      business_name: "PT's Tactical Renovations",
      logo_url: 'https://example.test/logo.png',
    });
    const withInstructions = built({ ...invoice, paymentInstructions: 'Checks to PO Box 1' });
    expect(withInstructions.detail.note.endsWith(' Checks to PO Box 1')).toBe(true);
    expect(built(invoice, { ...org, logoUrl: 'http://x' }).invoicer.logo_url).toBeUndefined();
  });
});

describe('helpers', () => {
  it('calendarDateInZone', () => {
    expect(calendarDateInZone(new Date('2026-11-05T03:30:00Z'), 'America/Chicago')).toBe(
      '2026-11-04',
    );
    expect(calendarDateInZone(new Date('2026-11-05T03:30:00Z'), 'UTC')).toBe('2026-11-05');
  });
  it('formatQuantity', () => {
    expect(formatQuantity('1.5000')).toBe('1.5');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity('0.25')).toBe('0.25');
    expect(formatQuantity('0')).toBeNull();
    expect(formatQuantity(-1)).toBeNull();
    expect(formatQuantity('abc')).toBeNull();
  });
  it('money', () => {
    expect(money('300')).toBe('300.00');
    expect(money(12.5)).toBe('12.50');
  });
  it('totalsAgree', () => {
    expect(totalsAgree('1250.00', 1250)).toBe(true);
    expect(totalsAgree('1250.01', 1250)).toBe(false);
    expect(totalsAgree('x', 1250)).toBe(false);
  });
});

describe('sendPreconditions', () => {
  const base = {
    status: 'sent' as const,
    clientEmail: 'a@b.co',
    clientName: 'A',
    paypalInvoiceId: null,
    paypalSentAt: null,
    connectionLive: true,
  };
  it('refuses without a connection', () => {
    expect(sendPreconditions({ ...base, connectionLive: false })).toEqual({
      ok: false,
      error: 'Connect PayPal in Settings first.',
    });
  });
  it('refuses a draft', () => {
    expect(sendPreconditions({ ...base, status: 'draft' })).toEqual({
      ok: false,
      error: 'Issue the invoice first; its amounts have to be locked before a client can pay them.',
    });
  });
  it('refuses a void invoice the same way', () => {
    expect(sendPreconditions({ ...base, status: 'void' })).toMatchObject({ ok: false });
  });
  it('refuses a paid invoice', () => {
    expect(sendPreconditions({ ...base, status: 'paid' })).toEqual({
      ok: false,
      error: 'This invoice is already paid.',
    });
  });
  it('refuses without an email', () => {
    expect(sendPreconditions({ ...base, clientEmail: null })).toEqual({
      ok: false,
      error: 'Add an email address to A first; PayPal sends the invoice to it.',
    });
  });
  it('refuses a second send', () => {
    expect(
      sendPreconditions({ ...base, paypalInvoiceId: 'INV2-X', paypalSentAt: new Date(2026, 10, 5) }),
    ).toEqual({ ok: false, error: 'Already sent through PayPal on 11/5/2026.' });
  });
  it('allows a retry when created but not sent', () => {
    expect(sendPreconditions({ ...base, paypalInvoiceId: 'INV2-X' })).toEqual({
      ok: true,
      retry: true,
    });
  });
  it('allows a fresh send', () => {
    expect(sendPreconditions(base)).toEqual({ ok: true, retry: false });
  });
});

describe('explainPayPalError', () => {
  it('names a duplicate number', () => {
    expect(
      explainPayPalError(
        422,
        { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'DUPLICATE_INVOICE_NUMBER' }] },
        'INV-1',
      ),
    ).toBe(
      "PayPal already has an invoice numbered INV-1. Change the number on PayPal's side or void and re-issue here.",
    );
  });
  it('names bad credentials', () => {
    expect(explainPayPalError(401, {}, 'INV-1')).toBe(
      'PayPal refused the client id and secret. Check them in Settings.',
    );
  });
  it('falls back to the status and name', () => {
    expect(explainPayPalError(500, { name: 'INTERNAL_SERVER_ERROR' }, 'INV-1')).toBe(
      'PayPal returned 500 (INTERNAL_SERVER_ERROR). Nothing was sent; try again in a minute.',
    );
    expect(explainPayPalError(503, null, 'INV-1')).toBe(
      'PayPal returned 503. Nothing was sent; try again in a minute.',
    );
  });
});

// ── What a fetched PayPal invoice means for the ledger ───────────────────────

describe('ledgerOpsFor', () => {
  const paid: PayPalFetchedInvoice = {
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
  it('turns a PayPal payment into one payment op at gross', () => {
    expect(ledgerOpsFor(paid, new Set())).toEqual([
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
  it('skips a payment it has already recorded', () => {
    expect(ledgerOpsFor(paid, new Set(['TX1']))).toEqual([
      { kind: 'skip', externalId: 'TX1', reason: 'already recorded' },
    ]);
  });
  it('leaves an external payment to hand entry', () => {
    const ext: PayPalFetchedInvoice = {
      ...paid,
      payments: {
        transactions: [
          { type: 'EXTERNAL', method: 'CHECK', amount: { currency_code: 'USD', value: '10.00' } },
        ],
      },
    };
    expect(ledgerOpsFor(ext, new Set())).toEqual([
      { kind: 'skip', externalId: null, reason: 'external payment; record by hand' },
    ]);
  });
  it('turns a PayPal refund into a refund op', () => {
    const refunded: PayPalFetchedInvoice = {
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
    expect(ledgerOpsFor(refunded, new Set())).toEqual([
      {
        kind: 'refund',
        externalId: 'RF1',
        amount: 1250,
        paymentDate: '2026-11-07',
        notes: 'PayPal refund on invoice INV2-A',
      },
    ]);
  });
  it('skips a refund it has already recorded', () => {
    const refunded: PayPalFetchedInvoice = {
      id: 'INV2-A',
      status: 'REFUNDED',
      refunds: {
        transactions: [
          { type: 'PAYPAL', refund_id: 'RF1', amount: { currency_code: 'USD', value: '5.00' } },
        ],
      },
    };
    expect(ledgerOpsFor(refunded, new Set(['RF1']))).toEqual([
      { kind: 'skip', externalId: 'RF1', reason: 'already recorded' },
    ]);
  });
  it('falls back to today when PayPal gives no date', () => {
    const undated: PayPalFetchedInvoice = {
      ...paid,
      payments: {
        transactions: [
          {
            type: 'PAYPAL',
            payment_id: 'TX2',
            method: 'PAYPAL',
            amount: { currency_code: 'USD', value: '5.00' },
          },
        ],
      },
    };
    expect(ledgerOpsFor(undated, new Set(), new Date('2026-11-08T12:00:00Z'))[0]).toMatchObject({
      paymentDate: '2026-11-08',
      method: 'paypal',
    });
  });
  it('skips a payment with no usable amount', () => {
    const bad: PayPalFetchedInvoice = {
      ...paid,
      payments: {
        transactions: [
          { type: 'PAYPAL', payment_id: 'TX3', amount: { currency_code: 'USD', value: 'x' } },
        ],
      },
    };
    expect(ledgerOpsFor(bad, new Set())).toEqual([
      { kind: 'skip', externalId: 'TX3', reason: 'no usable amount' },
    ]);
  });
  it('skips a PayPal payment with no transaction id', () => {
    const noId: PayPalFetchedInvoice = {
      ...paid,
      payments: {
        transactions: [{ type: 'PAYPAL', amount: { currency_code: 'USD', value: '5.00' } }],
      },
    };
    expect(ledgerOpsFor(noId, new Set())).toEqual([
      { kind: 'skip', externalId: null, reason: 'no transaction id' },
    ]);
  });
  it('is empty for an invoice with no transactions', () => {
    expect(ledgerOpsFor({ id: 'INV2-B', status: 'SENT' }, new Set())).toEqual([]);
  });
  it('lists payments before refunds', () => {
    const both: PayPalFetchedInvoice = {
      ...paid,
      refunds: {
        transactions: [
          {
            type: 'PAYPAL',
            refund_id: 'RF1',
            refund_date: '2026-11-07',
            amount: { currency_code: 'USD', value: '100.00' },
          },
        ],
      },
    };
    expect(ledgerOpsFor(both, new Set()).map((op) => op.kind)).toEqual(['payment', 'refund']);
  });
});
