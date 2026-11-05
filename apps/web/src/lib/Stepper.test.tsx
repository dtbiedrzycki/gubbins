import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stepper } from './Stepper';

function Counter() {
  const [value, setValue] = useState(1);
  return <Stepper id="count" label="How many?" value={value} min={1} max={3} onChange={setValue} />;
}

describe('Stepper', () => {
  it('steps between 1 and 3 and marks the buttons disabled at each end, keeping focus', async () => {
    const user = userEvent.setup();
    render(<Counter />);
    const group = screen.getByRole('group', { name: 'How many?' });
    const fewer = screen.getByRole('button', { name: 'One fewer' });
    const more = screen.getByRole('button', { name: 'One more' });
    expect(group).toHaveTextContent('1');
    expect(fewer).toHaveAttribute('aria-disabled', 'true');

    await user.click(more);
    await user.click(more);
    await user.click(more);

    expect(group).toHaveTextContent('3');
    expect(more).toHaveAttribute('aria-disabled', 'true');
    // A disabled attribute would drop focus to <body> under a keyboard user.
    expect(more).not.toBeDisabled();
    expect(more).toHaveFocus();
    expect(fewer).toHaveAttribute('aria-disabled', 'false');

    await user.click(fewer);

    expect(group).toHaveTextContent('2');
    expect(more).toHaveAttribute('aria-disabled', 'false');
  });
});
