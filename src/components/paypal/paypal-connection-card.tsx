'use client';

import { useActionState } from 'react';
import { Unplug, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ConnectionSummary, ProviderStatus } from '@/lib/paypal/paypal-core';
import {
  disconnectPayPal,
  retryPayPalWebhook,
  savePayPalConnection,
  testPayPalConnection,
} from '@/lib/paypal/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton, FormNotice } from '@/components/forms/form-bits';

/**
 * What the one-word `?paypal=` result from the one-tap actions means to a
 * person. Kept next to the card because it is the card's copy, not logic.
 */
const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  verified: { tone: 'ok', text: 'PayPal accepted the client id and secret.' },
  refused: { tone: 'warn', text: 'PayPal refused the client id and secret. Check them in Settings.' },
  webhook: { tone: 'ok', text: 'The webhook is registered. Payments will post automatically.' },
  webhook_failed: {
    tone: 'warn',
    text: 'PayPal would not register the webhook. Payments will not post automatically until Retry webhook succeeds.',
  },
  disconnected: { tone: 'ok', text: 'Disconnected. Nothing will send through PayPal until you reconnect.' },
  forbidden: { tone: 'warn', text: 'Only an owner can connect PayPal.' },
  unconfigured: { tone: 'warn', text: "PayPal isn't configured on this deployment yet." },
  failed: {
    tone: 'warn',
    text: 'Something went wrong talking to PayPal. Nothing was changed. Try again in a minute.',
  },
};

const initial = {} as { error?: string; message?: string };

export function PayPalConnectionCard({
  status,
  summary,
  mayManage,
  notice,
}: {
  status: ProviderStatus;
  summary: ConnectionSummary | null;
  mayManage: boolean;
  notice?: string;
}) {
  const flash = notice ? NOTICES[notice] : undefined;
  const live = summary?.live ? summary : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">PayPal</CardTitle>
        {live ? (
          <span className="flex items-center gap-2">
            {live.environment === 'sandbox' ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                SANDBOX
              </span>
            ) : null}
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Connected
            </span>
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {flash && (
          <p
            className={
              flash.tone === 'ok'
                ? 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm'
                : 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'
            }
          >
            {flash.text}
          </p>
        )}

        {!status.configured ? (
          <p className="text-sm text-muted-foreground">{status.message}</p>
        ) : live ? (
          <ConnectedView summary={live} mayManage={mayManage} />
        ) : mayManage ? (
          <ConnectForm />
        ) : (
          <p className="text-sm text-muted-foreground">Only an owner can connect PayPal.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectedView({ summary, mayManage }: { summary: ConnectionSummary; mayManage: boolean }) {
  return (
    <>
      <p className="text-sm">
        Connected to PayPal ({summary.environment}) as client{' '}
        <span className="font-medium">{summary.clientId}</span> since {summary.connectedOn}.
        {summary.lastVerifiedOn ? ` Last verified ${summary.lastVerifiedOn}.` : ''}
      </p>
      {summary.webhookRegistered ? (
        <p className="text-sm text-muted-foreground">
          Payments post to the ledger automatically through{' '}
          <code className="select-all break-all rounded bg-muted px-1 py-0.5 text-[11px]">
            {summary.webhookUrl}
          </code>
          .
        </p>
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          The webhook is not registered, so payments will not post automatically. Invoices can still
          be sent.
        </p>
      )}
      {mayManage ? (
        <div className="flex flex-wrap gap-2">
          <form action={testPayPalConnection}>
            <Button type="submit" variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" />
              Test connection
            </Button>
          </form>
          {!summary.webhookRegistered ? (
            <form action={retryPayPalWebhook}>
              <Button type="submit" variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Retry webhook
              </Button>
            </form>
          ) : null}
          <form action={disconnectPayPal}>
            <Button type="submit" variant="outline" size="sm">
              <Unplug className="h-4 w-4" />
              Disconnect
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only an owner can change the PayPal connection.</p>
      )}
    </>
  );
}

function ConnectForm() {
  const [state, formAction] = useActionState(savePayPalConnection, initial);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Connect the PayPal business account clients pay into. Create a REST app on
        developer.paypal.com and paste its client ID and secret here; the secret is encrypted before
        it is stored, and the app registers its own webhook so payments post to the ledger on their
        own. Start with a sandbox app, then switch to live.
      </p>
      <div>
        <Label htmlFor="paypal-environment" className="mb-1.5 block">
          Environment
        </Label>
        <Select id="paypal-environment" name="environment" defaultValue="sandbox">
          <option value="sandbox">Sandbox (testing)</option>
          <option value="live">Live</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="paypal-client-id" className="mb-1.5 block">
          Client ID
        </Label>
        <Input id="paypal-client-id" name="clientId" autoComplete="off" required />
      </div>
      <div>
        <Label htmlFor="paypal-client-secret" className="mb-1.5 block">
          Client secret
        </Label>
        <Input
          id="paypal-client-secret"
          name="clientSecret"
          type="password"
          autoComplete="off"
          required
        />
      </div>
      <FormNotice error={state.error} message={state.message} />
      <SubmitButton className="sm:w-auto" pendingLabel="Checking with PayPal…">
        Save and test
      </SubmitButton>
    </form>
  );
}
