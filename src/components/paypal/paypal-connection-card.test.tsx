import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PayPalConnectionCard } from './paypal-connection-card';
import type { ConnectionSummary, ProviderStatus } from '@/lib/paypal/paypal-core';

// The server actions and the pending/submitted states aren't under test here;
// the card's job is to show the right state and the right controls.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (_action: unknown, initial: unknown) => [initial, 'save'],
}));
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock('@/lib/paypal/actions', () => ({
  savePayPalConnection: 'save',
  testPayPalConnection: 'test',
  retryPayPalWebhook: 'retry',
  disconnectPayPal: 'disconnect',
}));

afterEach(cleanup);

const configured: ProviderStatus = {
  configured: true,
  missing: [],
  message: "PayPal is set up on this deployment. Connect the business's PayPal account below.",
};

const connected: ConnectionSummary = {
  live: true,
  environment: 'sandbox',
  clientId: 'AbC123',
  webhookRegistered: false,
  webhookUrl: null,
  connectedOn: '11/5/2026',
  lastVerifiedOn: null,
};

describe('PayPalConnectionCard', () => {
  it('names the missing variable when the deployment is not configured', () => {
    render(
      <PayPalConnectionCard
        status={{
          configured: false,
          missing: ['PAYPAL_CREDENTIAL_ENCRYPTION_KEY'],
          message:
            "PayPal isn't available yet. Missing: PAYPAL_CREDENTIAL_ENCRYPTION_KEY. Nothing can be stored until it is set.",
        }}
        summary={null}
        mayManage
      />,
    );
    expect(screen.getByText(/Missing: PAYPAL_CREDENTIAL_ENCRYPTION_KEY/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Client ID')).toBeNull();
  });

  it('offers the form to an owner with no connection', () => {
    render(<PayPalConnectionCard status={configured} summary={null} mayManage />);
    expect(screen.getByLabelText('Environment')).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Client secret')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save and test' })).toBeInTheDocument();
  });

  it('tells a non-owner who can connect', () => {
    render(<PayPalConnectionCard status={configured} summary={null} mayManage={false} />);
    expect(screen.getByText('Only an owner can connect PayPal.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Client ID')).toBeNull();
  });

  it('shows a sandbox badge and the retry button when the webhook is missing', () => {
    render(<PayPalConnectionCard status={configured} summary={connected} mayManage />);
    expect(screen.getByText('SANDBOX')).toBeInTheDocument();
    expect(screen.getByText(/payments will not post automatically/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry webhook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('shows the webhook URL and no badge when live and registered', () => {
    render(
      <PayPalConnectionCard
        status={configured}
        summary={{
          ...connected,
          environment: 'live',
          webhookRegistered: true,
          webhookUrl: 'https://foreman.example/api/webhooks/paypal',
          lastVerifiedOn: '11/6/2026',
        }}
        mayManage
      />,
    );
    expect(screen.queryByText('SANDBOX')).toBeNull();
    expect(screen.getByText(/foreman\.example\/api\/webhooks\/paypal/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry webhook' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument();
  });

  it('offers reconnection after a disconnect', () => {
    render(<PayPalConnectionCard status={configured} summary={{ ...connected, live: false }} mayManage />);
    expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });

  it('translates a notice from the URL', () => {
    render(<PayPalConnectionCard status={configured} summary={connected} mayManage notice="verified" />);
    expect(screen.getByText('PayPal accepted the client id and secret.')).toBeInTheDocument();
  });
});
