import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListDetails } from './ListDetails';

describe('ListDetails', () => {
  it('shows the title, description, key and guest link', () => {
    render(
      <ListDetails slug="abc123" onUnauthorized={() => {}} view={{ title: 'Baby Shower', description: 'Ship to **Elm Row**', key: 'maple-lantern-otter', items: [] }} />,
    );

    expect(screen.getByText('Baby Shower')).toBeInTheDocument();
    expect(screen.getByText('Elm Row').tagName).toBe('STRONG');
    expect(screen.getByText('maple-lantern-otter')).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/wishlists/abc123`)).toBeInTheDocument();
  });

  it('opens the edit form on the title, and Cancel puts focus back on Edit', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ListDetails slug="abc123" onUnauthorized={() => {}} view={{ title: 'Baby Shower', description: null, key: 'maple-lantern-otter', items: [] }} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('List title')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });
});
