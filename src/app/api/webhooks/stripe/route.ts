import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { stripeEnv, verifyWebhookEvent } from '@/lib/stripe/client';
import { applyStripeEvent } from '@/lib/stripe/webhook';

/**
 * Stripe's webhook endpoint. Register it in the Stripe Dashboard as
 * `<app URL>/api/webhooks/stripe` with the events the app acts on
 * (checkout.session.completed, customer.subscription.*, invoice.created,
 * invoice.paid, invoice.payment_failed) and set its signing secret as
 * STRIPE_WEBHOOK_SECRET.
 *
 * No session, no cookie: the caller is Stripe, and the signature is the only
 * thing that proves it. The body is read raw because the signature covers the
 * exact bytes — parsing it first would break verification.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const env = stripeEnv();
  if (!env.secretKey?.trim() || !env.webhookSecret?.trim()) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = verifyWebhookEvent(rawBody, signature);
  } catch (error) {
    logger.warn('stripe webhook: signature rejected', {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 });
  }

  try {
    const outcome = await applyStripeEvent(event);
    logger.info('stripe webhook', { id: event.id, type: event.type, ...outcome });
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    // A 500 is the signal Stripe retries on — used only for failures a retry
    // can fix (the database was unreachable, Stripe itself timed out).
    logger.error('stripe webhook: failed', {
      id: event.id,
      type: event.type,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Could not apply the event; Stripe will retry.' },
      { status: 500 },
    );
  }
}
