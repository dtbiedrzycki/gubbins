import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LimitedInput, LimitedTextarea } from './LimitedField';

function Field({ multiline = false, describedBy }: { multiline?: boolean; describedBy?: (string | false)[] }) {
  const [value, setValue] = useState('');
  const Control = multiline ? LimitedTextarea : LimitedInput;
  return (
    <>
      <label htmlFor="f">Name</label>
      <Control id="f" value={value} onChange={(e) => setValue(e.target.value)} max={5} describedBy={describedBy} />
      <p id="hint">Shown to the owner.</p>
    </>
  );
}

async function paste(text: string) {
  const user = userEvent.setup();
  const field = screen.getByLabelText('Name');
  await user.clear(field);
  await user.click(field);
  await user.paste(text);
  return field;
}

describe.each([
  { kind: 'input', multiline: false },
  { kind: 'textarea', multiline: true },
])('limited $kind', ({ multiline }) => {
  it('cuts a paste at the limit and warns that it may have been cut', async () => {
    render(<Field multiline={multiline} />);
    const field = await paste('abcdefgh');
    expect(field).toHaveValue('abcde');
    expect(field).toHaveAccessibleDescription("This is the limit of 5 characters. If you pasted it, check that the end wasn't cut off.");
    expect(screen.getByText(/cut off/)).toHaveAttribute('aria-live', 'polite');
  });

  it('has no description below the limit', async () => {
    render(<Field multiline={multiline} />);
    const field = await paste('abcd');
    expect(field).not.toHaveAttribute('aria-describedby');
  });

  it('keeps its other descriptions, and adds the warning after them at the limit', async () => {
    render(<Field multiline={multiline} describedBy={['hint', false]} />);
    const field = await paste('abcd');
    expect(field).toHaveAccessibleDescription('Shown to the owner.');
    await paste('abcde');
    expect(field).toHaveAccessibleDescription(/^Shown to the owner\. This is the limit of 5 characters/);
  });
});
