'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import type { FormState } from '@/lib/auth/actions';
import { publicEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { toNum } from '@/lib/catalog/catalog-core';
import { getInvoice } from '@/lib/invoices/queries';
import { formatMoney, type InvoiceStatus } from '@/lib/invoices/invoices-core';
import { recipientForClient } from '@/lib/email/queries';
import { PayPalApiError, createPayPalClient } from './client';
import {
  buildInvoiceRequest,
  explainPayPalError,
  isPayPalEnvironment,
  providerStatus,
  sendPreconditions,
  totalsAgree,
} from './paypal-core';
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

// ── Sending an invoice through PayPal ────────────────────────────────────────

/** Sending a client their bill is `financials:write`, the same as issuing it. */
async function requireFinancialsWrite(): Promise<
  { ok: true; orgId: string; userId: string } | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  if (!ctx.userId) redirect('/login');
  if (!ctx.dbAvailable || !ctx.activeOrg) {
    return { ok: false, error: 'Database or organization is not configured yet.' };
  }
  if (!can(ctx.activeOrg.roles, 'financials:write', ctx.activeOrg.extraPermissions)) {
    return { ok: false, error: 'You do not have permission to manage invoices.' };
  }
  return { ok: true, orgId: ctx.activeOrg.organizationId, userId: ctx.userId };
}

function uuidOrNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

/**
 * Put an issued Foreman invoice in front of the client as a PayPal invoice.
 *
 * Create, then compare PayPal's total with ours before anything is sent — a
 * draft whose total disagrees by a cent is deleted and the difference shown,
 * never emailed — then send, then read back the pay link. The PayPal id is
 * stored the moment it exists and `paypalSentAt` only after a successful send,
 * which is how a failed send is retried against the same PayPal invoice rather
 * than creating a second one.
 */
export async function sendInvoiceThroughPayPal(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await requireFinancialsWrite();
  if (!auth.ok) return { error: auth.error };
  const { orgId } = auth;

  const invoiceId = uuidOrNull(formData.get('invoiceId'));
  if (!invoiceId) return { error: 'Invoice not found.' };

  const row = await getInvoice(orgId, invoiceId);
  if (!row) return { error: 'Invoice not found.' };
  const invoice = row.invoice;

  const db = getDb();
  const [org] = await db
    .select({
      name: schema.organizations.name,
      logoUrl: schema.organizations.logoUrl,
      timezone: schema.organizations.timezone,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId));
  const [client] = await db
    .select({
      displayName: schema.clients.displayName,
      companyName: schema.clients.companyName,
    })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, orgId), eq(schema.clients.id, invoice.clientId)));
  const recipient = await recipientForClient(orgId, invoice.clientId);
  const clientName = client?.displayName ?? row.clientName ?? 'the client';
  const conn = await connectionFor(orgId);

  const pre = sendPreconditions({
    status: invoice.status as InvoiceStatus,
    clientEmail: recipient?.email ?? null,
    clientName,
    paypalInvoiceId: invoice.paypalInvoiceId,
    paypalSentAt: invoice.paypalSentAt,
    connectionLive: Boolean(conn),
  });
  if (!pre.ok) return { error: pre.error };
  if (!conn || !org) return { error: 'Connect PayPal in Settings first.' };

  let paypalInvoiceId = invoice.paypalInvoiceId;
  try {
    if (!pre.retry) {
      const built = buildInvoiceRequest(
        {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          issuedAt: invoice.issuedAt,
          dueDate: invoice.dueDate,
          taxRatePercent: toNum(invoice.taxRate),
          credits: toNum(invoice.credits),
          total: toNum(invoice.total),
          paymentInstructions: invoice.paymentInstructions,
          lines: row.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity ?? '1',
            unitPrice: l.unitPrice ?? '0',
            taxable: l.taxable,
          })),
        },
        { name: org.name, logoUrl: org.logoUrl, timezone: org.timezone },
        { displayName: clientName, companyName: client?.companyName ?? null, email: recipient?.email ?? null },
      );
      if (!built.ok) return { error: built.error };

      const created = await conn.client.createInvoice(built.body);
      paypalInvoiceId = created.id;
      await db
        .update(schema.invoices)
        .set({ paypalInvoiceId: created.id })
        .where(and(eq(schema.invoices.organizationId, orgId), eq(schema.invoices.id, invoiceId)));

      const theirs =
        created.amount?.value ?? (await conn.client.getInvoice(created.id)).amount?.value ?? '';
      if (!totalsAgree(theirs, toNum(invoice.total))) {
        await conn.client.deleteInvoice(created.id).catch((error: unknown) => {
          logger.error('paypal: could not delete a mismatched draft', {
            orgId,
            invoiceId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
        await db
          .update(schema.invoices)
          .set({ paypalInvoiceId: null })
          .where(and(eq(schema.invoices.organizationId, orgId), eq(schema.invoices.id, invoiceId)));
        logger.warn('paypal: totals disagree', { orgId, invoiceId, theirs, ours: invoice.total });
        return {
          error: `PayPal computed ${formatMoney(theirs)} for this invoice; the Foreman has ${formatMoney(invoice.total)}. Nothing was sent.`,
        };
      }
    }

    if (!paypalInvoiceId) return { error: 'Something went wrong talking to PayPal. Nothing was sent; try again in a minute.' };
    await conn.client.sendInvoice(paypalInvoiceId);
    const fetched = await conn.client.getInvoice(paypalInvoiceId);
    await db
      .update(schema.invoices)
      .set({
        paypalPayUrl: fetched.detail?.metadata?.recipient_view_url ?? null,
        paypalSentAt: new Date(),
      })
      .where(and(eq(schema.invoices.organizationId, orgId), eq(schema.invoices.id, invoiceId)));
    logger.info('paypal: invoice sent', { orgId, invoiceId, paypalInvoiceId });
  } catch (error) {
    if (error instanceof PayPalApiError) {
      logger.warn('paypal: send failed', {
        orgId,
        invoiceId,
        operation: error.operation,
        status: error.status,
      });
      return { error: explainPayPalError(error.status, error.body, invoice.invoiceNumber) };
    }
    logger.error('paypal: send failed', { orgId, invoiceId, message: describe(error) });
    return { error: 'Something went wrong talking to PayPal. Nothing was sent; try again in a minute.' };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath('/invoices');
  return { message: `Sent through PayPal to ${recipient?.email ?? clientName}.` };
}
