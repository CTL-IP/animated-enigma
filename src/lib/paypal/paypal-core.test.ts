import { describe, expect, it } from 'vitest';
import {
  connectionSummary,
  isPayPalEnvironment,
  isPayPalEvent,
  mapPayPalMethod,
  mapPayPalStatus,
  PAYPAL_API_BASE,
  PAYPAL_EVENTS,
  providerStatus,
  readWebhookHeaders,
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
