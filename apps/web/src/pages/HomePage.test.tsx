import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from './HomePage';

describe('HomePage', () => {
  it('states the four promises', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Gubbins' })).toBeInTheDocument();
    expect(screen.getByText('A wishlist that respects the people using it.')).toBeInTheDocument();
    const points = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(points).toEqual([
      'No tracking. No accounts, no profiles, and nothing that follows you around the web.',
      'No ads. Ever.',
      'Self-hostable. Runs on a Raspberry Pi.',
      'Open source under the AGPL v3.',
    ]);
    expect(screen.getByRole('link', { name: 'AGPL v3' })).toHaveAttribute('href', 'https://www.gnu.org/licenses/agpl-3.0.html');
  });

  it('points invited guests to their invite and offers no way to create a list', () => {
    render(<HomePage />);

    expect(screen.getByText('Got an invite? Open the link from it.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('/wishlists/new');
    }
  });
});
