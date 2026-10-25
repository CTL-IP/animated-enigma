import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PricingSection } from './pricing-section';

afterEach(cleanup);

describe('PricingSection', () => {
  it('shows the four monthly bases the billing module charges', () => {
    render(<PricingSection />);
    const text = document.body.textContent ?? '';
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();
    expect(text).toContain('$150.00');
    expect(text).toContain('$1,200.00');
    expect(text).toContain('$1,500.00');
    expect(text).toContain('$2,750.00');
    expect(text).toContain('counted once');
  });
});
