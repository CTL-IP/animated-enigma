'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import type { FormState } from '@/lib/auth/actions';
import { publicEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { PayPalApiError, createPayPalClient } from './client';
import { isPayPalEnvironment, providerStatus } from './paypal-core';
import { connectionFor, encryptSecret, ensureWebhook, paypalEnv } from './connection';
import { connectionRow } from './queries';

/**
 * Connecting the business's PayPal account is `org:manage` work: it decides
 * where client money lands. Held by the owner role alone.
 */
async function requireOrgManage(): Promise<
  { ok: true; orgId: string; userId: string } | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  if (!ctx.userId) redirect('/login?next=/settings');
  if (!ctx.dbAvailable || !ctx.activeOrg) {
    return { ok: false, error: 'Database or organization is not configured yet.' };
  }
  if (!can(ctx.activeOrg.roles, 'org:manage', ctx.activeOrg.extraPermissions)) {
    return { ok: false, error: 'Only an owner can connect PayPal.' };
  }
  return { ok: true, orgId: ctx.activeOrg.organizationId, userId: ctx.userId };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Store the organization's PayPal credentials — after proving them. The pair
 * is tried for a token first; a pair PayPal refuses is never written, so the
 * table never holds a credential nobody can use. Then the app registers its
 * own webhook, and says plainly when that part did not work.
 */
export async function savePayPalConnection(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireOrgManage();
  if (!auth.ok) return { error: auth.error };
  const { orgId, userId } = auth;

  const status = providerStatus(paypalEnv());
  if (!status.configured) return { error: status.message };

  const environment = String(formData.get('environment') ?? '').trim();
  const clientId = String(formData.get('clientId') ?? '').trim();
  const clientSecret = String(formData.get('clientSecret') ?? '').trim();
  if (!isPayPalEnvironment(environment)) return { error: 'Choose sandbox or live.' };
  if (!clientId) return { error: 'Enter the client ID from the PayPal developer dashboard.' };
  if (!clientSecret) return { error: 'Enter the client secret from the PayPal developer dashboard.' };

  try {
    await createPayPalClient({ environment, clientId, clientSecret }).token();
  } catch (error) {
    if (error instanceof PayPalApiError && (error.status === 401 || error.status === 400)) {
      return { error: 'PayPal refused the client id and secret. Check them and try again.' };
    }
    logger.error('paypal: credential check failed', { orgId, message: describe(error) });
    return { error: 'Something went wrong talking to PayPal. Nothing was stored; try again in a minute.' };
  }

  const ciphertext = encryptSecret(clientSecret);
  if (!ciphertext) return { error: status.message };

  const now = new Date();
  const db = getDb();
  try {
    const existing = await connectionRow(orgId);
    if (existing) {
      await db
        .update(schema.paypalConnections)
        .set({
          environment,
          clientId,
          clientSecretCiphertext: ciphertext,
          webhookId: null,
          webhookUrl: null,
          connectedBy: userId,
          connectedAt: now,
          lastVerifiedAt: now,
          revokedAt: null,
        })
        .where(eq(schema.paypalConnections.id, existing.id));
    } else {
      await db.insert(schema.paypalConnections).values({
        organizationId: orgId,
        environment,
        clientId,
        clientSecretCiphertext: ciphertext,
        connectedBy: userId,
        connectedAt: now,
        lastVerifiedAt: now,
      });
    }
  } catch (error) {
    logger.error('paypal: storing the connection failed', { orgId, message: describe(error) });
    return { error: 'The credentials checked out but could not be saved. Try again in a minute.' };
  }
  revalidatePath('/settings');

  const registered = await registerWebhook(orgId);
  revalidatePath('/settings');
  return registered
    ? { message: 'PayPal is connected and the webhook is registered.' }
    : {
        message:
          'PayPal is connected, but the webhook could not be registered. Payments will not post automatically until Retry webhook succeeds.',
      };
}

/** Register (or find) the webhook and store its id. False, logged, when PayPal would not. */
async function registerWebhook(orgId: string): Promise<boolean> {
  const conn = await connectionFor(orgId);
  if (!conn) return false;
  try {
    const hook = await ensureWebhook(conn, publicEnv.appUrl);
    await getDb()
      .update(schema.paypalConnections)
      .set({ webhookId: hook.id, webhookUrl: hook.url })
      .where(eq(schema.paypalConnections.organizationId, orgId));
    return true;
  } catch (error) {
    logger.error('paypal: webhook registration failed', { orgId, message: describe(error) });
    return false;
  }
}

/** One tap: prove the stored pair still works, and remember when it last did. */
export async function testPayPalConnection(): Promise<void> {
  const auth = await requireOrgManage();
  if (!auth.ok) redirect('/settings?paypal=forbidden');
  let notice = 'failed';
  try {
    const conn = await connectionFor(auth.orgId);
    if (!conn) {
      notice = 'unconfigured';
    } else {
      await conn.client.token();
      await getDb()
        .update(schema.paypalConnections)
        .set({ lastVerifiedAt: new Date() })
        .where(eq(schema.paypalConnections.organizationId, auth.orgId));
      notice = 'verified';
    }
  } catch (error) {
    notice = error instanceof PayPalApiError && error.status === 401 ? 'refused' : 'failed';
    logger.warn('paypal: test connection failed', { orgId: auth.orgId, message: describe(error) });
  }
  revalidatePath('/settings');
  redirect(`/settings?paypal=${notice}`);
}

/** One tap: try the webhook registration again. */
export async function retryPayPalWebhook(): Promise<void> {
  const auth = await requireOrgManage();
  if (!auth.ok) redirect('/settings?paypal=forbidden');
  const ok = await registerWebhook(auth.orgId);
  revalidatePath('/settings');
  redirect(`/settings?paypal=${ok ? 'webhook' : 'webhook_failed'}`);
}

/**
 * Disconnect: the row is revoked, not deleted, so "when was PayPal connected
 * and by whom" stays answerable. Reconnecting updates it in place.
 */
export async function disconnectPayPal(): Promise<void> {
  const auth = await requireOrgManage();
  if (!auth.ok) redirect('/settings?paypal=forbidden');
  try {
    await getDb()
      .update(schema.paypalConnections)
      .set({ revokedAt: new Date() })
      .where(eq(schema.paypalConnections.organizationId, auth.orgId));
  } catch (error) {
    logger.error('paypal: disconnect failed', { orgId: auth.orgId, message: describe(error) });
    redirect('/settings?paypal=failed');
  }
  revalidatePath('/settings');
  redirect('/settings?paypal=disconnected');
}
