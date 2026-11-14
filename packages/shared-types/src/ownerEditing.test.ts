import { describe, expect, it } from 'vitest';
import { editListDetailsRequestSchema, moveItemRequestSchema } from './ownerEditing.js';

describe('editListDetailsRequestSchema', () => {
  it('requires the description, with null to clear it, so a forgotten field is refused rather than wiped', () => {
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower', description: null, theme: 'groovy' }).success).toBe(true);
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower', theme: 'groovy' }).success).toBe(false);
  });

  it.each([['missing', undefined], ['not storybook or groovy', 'disco']])('refuses a style that is %s', (_name, theme) => {
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower', description: null, theme }).success).toBe(false);
  });
});

describe('moveItemRequestSchema', () => {
  it.each(['top', 'up', 'down', 'bottom'])('accepts %s', (to) => {
    expect(moveItemRequestSchema.safeParse({ to }).success).toBe(true);
  });

  it.each([['missing', {}], ['"first"', { to: 'first' }]])('refuses a body whose to is %s', (_name, body) => {
    expect(moveItemRequestSchema.safeParse(body).success).toBe(false);
  });
});
