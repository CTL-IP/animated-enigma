/**
 * After a save, an invoice line's Taxable box has to show what was saved.
 *
 * React 19, which the app runs, resets a form's fields natively once its action
 * finishes, and restores only what it re-renders. A controlled checkbox falls
 * back to the default React gave it at mount. So on the real editor, a box
 * changed since the page loaded flipped back on screen after the save, while
 * the hidden input kept sending the new value: the next save stored what the
 * screen didn't show.
 *
 * The suite renders with React 18, which never runs a function as a form's
 * action or resets the form afterwards, so these tests call `form.reset()`,
 * the same native reset React 19 performs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InvoiceForm } from '@/app/(app)/invoices/[id]/invoice-form';

// React 18's react-dom has neither hook, and only takes a string as a form's
// action; the app's React 19 has both hooks and takes the server action. The
// form's saved message and pending state aren't under test.
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  useFormState: (_action: unknown, initial: unknown) => [initial, 'saveInvoice'],
  useFormStatus: () => ({ pending: false }),
}));
vi.mock('@/lib/invoices/actions', () => ({ saveInvoice: 'saveInvoice' }));

afterEach(cleanup);

function renderForm() {
  render(
    <InvoiceForm
      invoiceId="00260aaa-0000-4000-8000-000000000001"
      initial={{
        lines: [
          { description: 'Cabinets, supplied', quantity: '1', unitPrice: '1000', taxable: true },
          { description: 'Install cabinets', quantity: '1', unitPrice: '500', taxable: false },
        ],
        taxRate: '8.25',
        credits: '0',
        dueDate: '',
        paymentInstructions: '',
      }}
    />,
  );
  return screen.getByRole('button', { name: 'Save invoice' }).closest('form')!;
}

function boxes(): HTMLInputElement[] {
  return screen.getAllByRole('checkbox', { name: 'Taxable' });
}

/** What each line's box shows, and what the form sends for that line. */
function taxable(form: HTMLFormElement) {
  return {
    shown: boxes().map((b) => b.checked),
    sent: new FormData(form).getAll('lineTaxable'),
  };
}

describe('invoice Taxable boxes after the form resets', () => {
  it('keeps an unticked line unticked', () => {
    const form = renderForm();
    fireEvent.click(boxes()[0]!);
    expect(taxable(form)).toEqual({ shown: [false, false], sent: ['false', 'false'] });

    form.reset();

    expect(taxable(form)).toEqual({ shown: [false, false], sent: ['false', 'false'] });
  });

  it('keeps a ticked line ticked', () => {
    const form = renderForm();
    fireEvent.click(boxes()[1]!);

    form.reset();

    expect(taxable(form)).toEqual({ shown: [true, true], sent: ['true', 'true'] });
  });

  it('leaves untouched lines as they loaded', () => {
    const form = renderForm();

    form.reset();

    expect(taxable(form)).toEqual({ shown: [true, false], sent: ['true', 'false'] });
  });

  it('shows what it sends after a box is changed and changed back', () => {
    const form = renderForm();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[0]!);

    form.reset();

    expect(taxable(form)).toEqual({ shown: [true, false], sent: ['true', 'false'] });
  });

  it('keeps an added line’s box in step', () => {
    const form = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    fireEvent.click(boxes()[2]!);

    form.reset();

    expect(taxable(form)).toEqual({
      shown: [true, false, false],
      sent: ['true', 'false', 'false'],
    });
  });
});
