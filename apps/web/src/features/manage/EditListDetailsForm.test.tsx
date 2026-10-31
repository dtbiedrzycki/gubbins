import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mock } from '../../test/msw/mock';
import { server } from '../../test/msw/server';
import { EditListDetailsForm } from './EditListDetailsForm';

function renderForm(props: Partial<Parameters<typeof EditListDetailsForm>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <EditListDetailsForm slug="abc123" title="Baby Shower" description="Ship to Elm Row" onDone={() => {}} onUnauthorized={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('EditListDetailsForm', () => {
  it('starts with the current details and sends them trimmed, leaving out a cleared description', async () => {
    const bodies: unknown[] = [];
    server.use(http.put('/api/lists/:slug', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ ok: true });
    }));
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderForm({ onDone });

    expect(screen.getByLabelText('List title')).toHaveValue('Baby Shower');
    expect(screen.getByLabelText('List title')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('About this list (optional)')).toHaveValue('Ship to Elm Row');
    expect(screen.getByLabelText('About this list (optional)')).toHaveAttribute('maxlength', '2000');

    await user.clear(screen.getByLabelText('List title'));
    await user.type(screen.getByLabelText('List title'), '  Shower  ');
    await user.clear(screen.getByLabelText('About this list (optional)'));
    await user.type(screen.getByLabelText('About this list (optional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodies).toEqual([{ title: 'Shower' }]);
  });

  it('returns to the token gate when the save answers 404', async () => {
    server.use(mock('put', '/api/lists/{slug}', 404, { message: 'Not found' }));
    const onUnauthorized = vi.fn();
    const user = userEvent.setup();
    renderForm({ onUnauthorized });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
