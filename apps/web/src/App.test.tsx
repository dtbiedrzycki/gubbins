import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from './test/msw/server';
import { mock } from './test/msw/mock';
import App from './App';

describe('App', () => {
  it('renders the create-list page at the root path', async () => {
    server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: null }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Create a wishlist' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://git.example.org/fork'));
  });
});
