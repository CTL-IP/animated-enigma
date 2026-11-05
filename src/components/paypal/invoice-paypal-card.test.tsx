import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InvoicePayPalCard, type InvoicePayPalCardProps } from './invoice-paypal-card';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (_action: unknown, initial: unknown) => [initial, 'send'],
}));
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock('@/lib/paypal/actions', () => ({ sendInvoiceThroughPayPal: 'send' }));

afterEach(cleanup);

const base: InvoicePayPalCardProps = {
  invoiceId: '11111111-2222-4333-8444-555555555555',
  state: 'ready',
  clientEmail: 'mary@example.com',
  clientName: 'Mary Ann Lee',
  clientId: '22222222-2222-4333-8444-555555555555',
  payUrl: null,
  sentOn: null,
  paidOn: null,
  settingsMissing: [],
  mayWrite: true,
};

describe('InvoicePayPalCard', () => {
  it('points at Settings, naming the missing variable, when PayPal is not connected', () => {
    render(
      <InvoicePayPalCard
        {...base}
        state="unconfigured"
        settingsMissing={['PAYPAL_CREDENTIAL_ENCRYPTION_KEY']}
      />,
    );
    expect(screen.getByText(/PayPal isn't connected/)).toBeInTheDocument();
    expect(screen.getByText(/PAYPAL_CREDENTIAL_ENCRYPTION_KEY/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');
  });

  it('asks for the invoice to be issued first', () => {
    render(<InvoicePayPalCard {...base} state="not_issued" />);
    expect(screen.getByText('Issue the invoice first; PayPal sends locked amounts.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the client who needs an email address', () => {
    render(<InvoicePayPalCard {...base} state="no_email" clientEmail={null} />);
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' && /Add an email address to Mary Ann Lee first/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mary Ann Lee/ })).toHaveAttribute(
      'href',
      '/clients/22222222-2222-4333-8444-555555555555',
    );
  });

  it('offers the send button to someone who may write', () => {
    render(<InvoicePayPalCard {...base} />);
    expect(screen.getByText(/mary@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send through PayPal' })).toBeInTheDocument();
  });

  it('shows no button to a reader', () => {
    render(<InvoicePayPalCard {...base} mayWrite={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry when created but not sent', () => {
    render(<InvoicePayPalCard {...base} state="created" />);
    expect(screen.getByText('Created on PayPal but not sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry send' })).toBeInTheDocument();
  });

  it('shows the pay link with a copy button once sent', () => {
    render(
      <InvoicePayPalCard
        {...base}
        state="sent"
        sentOn="11/5/2026"
        payUrl="https://www.paypal.com/invoice/p/abc"
      />,
    );
    expect(screen.getByText(/Sent through PayPal on 11\/5\/2026 to mary@example.com/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://www.paypal.com/invoice/p/abc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('reports a PayPal payment', () => {
    render(<InvoicePayPalCard {...base} state="paid" paidOn="11/7/2026" />);
    expect(screen.getByText('Paid through PayPal on 11/7/2026.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
