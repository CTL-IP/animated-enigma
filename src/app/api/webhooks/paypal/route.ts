import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { readWebhookHeaders } from '@/lib/paypal/paypal-core';
import { handlePayPalWebhook } from '@/lib/paypal/webhook';
import { liveDeps } from '@/lib/paypal/webhook-live';

/**
 * PayPal's webhook endpoint. The app registers it with PayPal itself when an
 * organization connects (`<app URL>/api/webhooks/paypal`, the three
 * INVOICING.INVOICE.* events the handler acts on).
 *
 * No session, no cookie: the caller is PayPal, and the signature — verified
 * by posting it back to PayPal — is the only thing that proves it. The body
 * is read raw because the signature covers the exact bytes; parsing it first
 * would break verification.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers = readWebhookHeaders((name) => request.headers.get(name));

  try {
    const outcome = await handlePayPalWebhook(rawBody, headers, liveDeps());
    logger.info('paypal webhook', { ...outcome });
    return NextResponse.json(
      { received: outcome.status === 200, handled: outcome.handled, note: outcome.note },
      { status: outcome.status },
    );
  } catch (error) {
    // A 500 is the signal PayPal retries on — used only for failures a retry
    // can fix (the database was unreachable, PayPal itself timed out).
    logger.error('paypal webhook: failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Could not apply the event; PayPal will retry.' },
      { status: 500 },
    );
  }
}
