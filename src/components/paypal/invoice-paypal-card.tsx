'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Send } from 'lucide-react';
import { sendInvoiceThroughPayPal } from '@/lib/paypal/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubmitButton, FormNotice } from '@/components/forms/form-bits';

export type InvoicePayPalState =
  | 'unconfigured'
  | 'not_issued'
  | 'no_email'
  | 'ready'
  | 'created'
  | 'sent'
  | 'paid';

export interface InvoicePayPalCardProps {
  invoiceId: string;
  state: InvoicePayPalState;
  clientEmail: string | null;
  clientName: string;
  clientId: string;
  payUrl: string | null;
  sentOn: string | null;
  paidOn: string | null;
  /** Deployment variables missing, by name, when that is why PayPal is off. */
  settingsMissing: string[];
  mayWrite: boolean;
}

const initial = {} as { error?: string; message?: string };

/**
 * One card, seven states, each saying what to do next. The button exists only
 * in the two states where pressing it does something, and only for someone
 * who may record money; a reader sees where the invoice stands and nothing
 * they cannot act on.
 */
export function InvoicePayPalCard(props: InvoicePayPalCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">PayPal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Body {...props} />
      </CardContent>
    </Card>
  );
}

function Body(props: InvoicePayPalCardProps) {
  switch (props.state) {
    case 'unconfigured':
      return (
        <p className="text-sm text-muted-foreground">
          PayPal isn&apos;t connected. Connect it in{' '}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
          {props.settingsMissing.length > 0
            ? ` Missing on this deployment: ${props.settingsMissing.join(', ')}.`
            : ''}
        </p>
      );
    case 'not_issued':
      return (
        <p className="text-sm text-muted-foreground">
          Issue the invoice first; PayPal sends locked amounts.
        </p>
      );
    case 'no_email':
      return (
        <p className="text-sm text-muted-foreground">
          Add an email address to{' '}
          <Link href={`/clients/${props.clientId}`} className="underline">
            {props.clientName}
          </Link>{' '}
          first; PayPal sends the invoice to it.
        </p>
      );
    case 'ready':
    case 'created':
      return <SendForm {...props} />;
    case 'sent':
      return (
        <>
          <p className="text-sm">
            Sent through PayPal on {props.sentOn} to {props.clientEmail}. The client got an email
            with a Pay button; the same link can be texted.
          </p>
          {props.payUrl ? <CopyLink url={props.payUrl} /> : null}
        </>
      );
    case 'paid':
      return <p className="text-sm">Paid through PayPal on {props.paidOn}.</p>;
  }
}

function SendForm(props: InvoicePayPalCardProps) {
  const [state, formAction] = useActionState(sendInvoiceThroughPayPal, initial);
  const retry = props.state === 'created';
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {retry
          ? 'Created on PayPal but not sent.'
          : `PayPal will email ${props.clientEmail} an invoice with a Pay button. No account needed on their side.`}
      </p>
      {props.mayWrite ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="invoiceId" value={props.invoiceId} />
          <FormNotice error={state.error} message={state.message} />
          <SubmitButton className="sm:w-auto" pendingLabel="Talking to PayPal…">
            <Send className="h-4 w-4" />
            {retry ? 'Retry send' : 'Send through PayPal'}
          </SubmitButton>
        </form>
      ) : null}
    </>
  );
}

function CopyLink({ url }: { url: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard permission: leave the text selected so a long-press copies it.
      field.current?.select();
    }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input ref={field} readOnly value={url} className="select-all text-xs" aria-label="Pay link" />
      <Button type="button" variant="outline" size="sm" className="sm:w-auto" onClick={copy}>
        <Copy className="h-4 w-4" />
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}
