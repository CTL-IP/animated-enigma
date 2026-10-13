import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TaxCheckCard } from './tax-check-card';
import type { TaxCheck } from '@/lib/texas-tax/job-checks';

afterEach(cleanup);

const warning: TaxCheck = {
  id: 'nonresidential-untaxed',
  level: 'warn',
  title: 'No tax on a commercial job',
  body: 'Texas taxes the whole charge for repairing or remodeling a commercial building.',
  publications: ['94-116'],
  ledger: ['nonresidential-total-charge-taxable'],
};

const note: TaxCheck = {
  id: 'nonresidential-rate',
  level: 'info',
  title: 'Commercial job: the job site’s rate applies',
  body: 'Local tax follows the job site.',
  publications: ['94-105', 'sales-tax-rates'],
  ledger: ['local-tax-job-site'],
};

describe('TaxCheckCard', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<TaxCheckCard checks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each check with a link to the publication behind it', () => {
    render(<TaxCheckCard checks={[warning, note]} />);
    expect(screen.getByText('Texas tax check')).toBeInTheDocument();
    expect(screen.getByText('No tax on a commercial job')).toBeInTheDocument();
    expect(screen.getByText(/whole charge/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pub 94-116' })).toHaveAttribute(
      'href',
      'https://comptroller.texas.gov/taxes/publications/94-116.php',
    );
    // An unnumbered source is named by its title.
    expect(screen.getByRole('link', { name: 'Texas Sales Tax Rates' })).toHaveAttribute(
      'href',
      'https://comptroller.texas.gov/taxes/sales/',
    );
  });

  it('says when the rules were read, and that it is a check', () => {
    render(<TaxCheckCard checks={[note]} />);
    expect(screen.getByText(/as read on 2026-09-26\. A check, not tax advice\./)).toBeInTheDocument();
  });
});
