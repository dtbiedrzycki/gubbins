import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationCard } from './InvitationCard';

describe('InvitationCard', () => {
  it('Copy key copies the key and Copy link copies the full guest link', async () => {
    const user = userEvent.setup();
    render(<InvitationCard guestKey="maple-lantern-otter" slug="abc123" />);

    await user.click(screen.getByRole('button', { name: 'Copy key' }));
    expect(await navigator.clipboard.readText()).toBe('maple-lantern-otter');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/wishlists/abc123`);
  });
});
