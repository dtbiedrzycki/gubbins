import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../test/msw/server';
import { mock } from '../test/msw/mock';
import PrivacyPage from './PrivacyPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PrivacyPage /></QueryClientProvider>);
}

describe('PrivacyPage', () => {
  it('names the contact from the server when one is set', async () => {
    server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: 'privacy@example.org' }));
    renderPage();

    expect(await screen.findByText('privacy@example.org')).toBeInTheDocument();
    expect(screen.queryByText(/whoever runs this site/)).not.toBeInTheDocument();
  });

  it('tells guests to contact whoever runs the site when no contact is set', async () => {
    server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: null }));
    renderPage();

    expect(await screen.findByText(/contact whoever runs this site/)).toBeInTheDocument();
  });
});
