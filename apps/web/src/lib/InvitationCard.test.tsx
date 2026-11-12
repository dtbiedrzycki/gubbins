import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationCard } from './InvitationCard';

describe('InvitationCard', () => {
  it('Copy link copies the guest link with the key in its fragment', async () => {
    const user = userEvent.setup();
    render(<InvitationCard guestKey="maple-lantern-otter" slug="abc123" linked />);

    expect(screen.getByTestId('guest-link').getAttribute('href')).toMatch(/#key=maple-lantern-otter$/);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/wishlists/abc123#key=maple-lantern-otter`);
  });
});
