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

describe('a typeable Stepper', () => {
  function TypeableCounter() {
    const [value, setValue] = useState(2);
    return <><Stepper typeable id="count" label="Quantity" value={value} min={1} max={99} onChange={setValue} /><p>Value {value}</p></>;
  }

  it.each([['150', '99'], ['0', '1'], ['', '2'], ['7', '7']])('turns a typed "%s" into %s when the owner leaves the box', async (typed, shown) => {
    const user = userEvent.setup();
    render(<TypeableCounter />);
    const box = screen.getByLabelText('Quantity');

    await user.clear(box);
    if (typed) await user.type(box, typed);
    await user.tab();

    expect(box).toHaveValue(shown);
    expect(screen.getByText(`Value ${shown}`)).toBeInTheDocument();
  });

  it('ignores anything but digits', async () => {
    const user = userEvent.setup();
    render(<TypeableCounter />);
    const box = screen.getByLabelText('Quantity');
    await user.clear(box);
    await user.type(box, '1a-2.');
    expect(box).toHaveValue('12');
  });

  it('steps from a typed number', async () => {
    const user = userEvent.setup();
    render(<TypeableCounter />);
    const box = screen.getByLabelText('Quantity');
    await user.clear(box);
    await user.type(box, '40');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    expect(box).toHaveValue('41');
  });
});
