import { decryptToken, encryptToken, parseEncryptionKey } from '@/lib/google/google-core';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createPayPalClient, type PayPalClient } from './client';
import { PAYPAL_EVENTS, isPayPalEnvironment, type PayPalEnv, type PayPalEnvironment } from './paypal-core';
import { connectionRow } from './queries';

/**
 * From a stored connection to a client that can call PayPal for one
 * organization. This is the only place the client secret is decrypted, for
 * the lifetime of one client object; tokens live in process memory and are
 * never stored.
 *
 * Plain module, not `'use server'`: it checks no permission, so nothing here
 * may be reachable from a browser. The action or the webhook that calls it
 * has already done the checking.
 */

/** The PayPal-relevant slice of the server environment, in the core's shape. */
export function paypalEnv(): PayPalEnv {
  return { encryptionKey: serverEnv().PAYPAL_CREDENTIAL_ENCRYPTION_KEY };
}

export interface ReadyConnection {
  organizationId: string;
  environment: PayPalEnvironment;
  client: PayPalClient;
  webhookId: string | null;
  webhookUrl: string | null;
}

/**
 * A ready client for the organization, or null.
 *
 * Null covers every reason nothing can be sent — no row, revoked, the key
 * missing, the ciphertext unreadable after a key rotation — because at every
 * call site the right response is the same: say PayPal is not connected. The
 * distinctions are logged here, where someone debugging can see them.
 */
export async function connectionFor(organizationId: string): Promise<ReadyConnection | null> {
  const key = parseEncryptionKey(paypalEnv().encryptionKey);
  if (!key) {
    logger.warn('paypal: PAYPAL_CREDENTIAL_ENCRYPTION_KEY missing or not 32 bytes', { organizationId });
    return null;
  }
  const row = await connectionRow(organizationId);
  if (!row || row.revokedAt) return null;
  if (!isPayPalEnvironment(row.environment)) {
    logger.error('paypal: stored environment is not sandbox or live', { organizationId });
    return null;
  }
  const secret = decryptToken(row.clientSecretCiphertext, key);
  if (!secret) {
    logger.error('paypal: stored secret could not be decrypted — was the key rotated?', {
      organizationId,
    });
    return null;
  }
  return {
    organizationId,
    environment: row.environment,
    client: createPayPalClient({ environment: row.environment, clientId: row.clientId, clientSecret: secret }),
    webhookId: row.webhookId,
    webhookUrl: row.webhookUrl,
  };
}

/** Encrypt a secret under the deployment key, or null when the key is unusable. */
export function encryptSecret(plain: string): string | null {
  const key = parseEncryptionKey(paypalEnv().encryptionKey);
  return key ? encryptToken(plain, key) : null;
}

/** Where PayPal should deliver events for this deployment. */
export function webhookUrlFor(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/webhooks/paypal`;
}

/**
 * Register the app's webhook with PayPal, or reuse the one already pointing
 * at this URL so that saving twice does not register twice.
 */
export async function ensureWebhook(
  conn: ReadyConnection,
  appUrl: string,
): Promise<{ id: string; url: string }> {
  const url = webhookUrlFor(appUrl);
  const existing = (await conn.client.listWebhooks()).find((hook) => hook.url === url);
  if (existing) return { id: existing.id, url };
  const created = await conn.client.createWebhook(url, PAYPAL_EVENTS);
  return { id: created.id, url };
}
