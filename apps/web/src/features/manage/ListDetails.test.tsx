import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListDetails } from './ListDetails';

describe('ListDetails', () => {
  it('shows the title, description, key and guest link', () => {
    render(
      <ListDetails slug="abc123" view={{ title: 'Baby Shower', description: 'Ship to **Elm Row**', key: 'maple-lantern-otter', items: [] }} />,
    );

    expect(screen.getByText('Baby Shower')).toBeInTheDocument();
    expect(screen.getByText('Elm Row').tagName).toBe('STRONG');
    expect(screen.getByText('maple-lantern-otter')).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/wishlists/abc123`)).toBeInTheDocument();
  });
});
