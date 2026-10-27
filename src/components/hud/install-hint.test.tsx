import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InstallHint } from './install-hint';

afterEach(cleanup);

describe('InstallHint', () => {
  it('shows the Safari Home Screen steps in a browser tab', () => {
    render(<InstallHint />);
    expect(screen.getByRole('complementary', { name: 'Install Foreman on this phone' })).toBeTruthy();
    expect(screen.getByText('Add Foreman to your Home Screen')).toBeTruthy();
    expect(screen.getByText(/Safari → Share → Add to Home Screen/)).toBeTruthy();
  });
});
