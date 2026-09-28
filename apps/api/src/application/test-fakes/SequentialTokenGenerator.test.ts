import { describe, expect, it } from 'vitest';
import { SequentialTokenGenerator } from './SequentialTokenGenerator.js';
import { UuidId } from '../../domain/value-objects/UuidId.js';

describe('SequentialTokenGenerator', () => {
  it('counts each kind of token independently, from 1', () => {
    const gen = new SequentialTokenGenerator();
    expect(gen.generateId()).toBe('00000000-0000-4000-8000-000000000001');
    expect(gen.generateId()).toBe('00000000-0000-4000-8000-000000000002');
    expect(gen.generateSlug()).toBe('slug-1');
    expect(gen.generateOwnerToken()).toBe('owner-token-1');
    expect(gen.generateGuestKey()).toBe('guest-key-1');
    expect(gen.generateHoldSecret()).toBe('hold-secret-1');
    expect(gen.generateSessionId()).toBe('session-1');
    expect(gen.generateSlug()).toBe('slug-2');
  });

  it('numbers a kind independently of how many other tokens were minted first', () => {
    const shared = new SequentialTokenGenerator();
    shared.generateSlug();
    shared.generateOwnerToken();
    shared.generateGuestKey();

    expect(shared.generateId()).toBe(new SequentialTokenGenerator().generateId());
  });

  it('produces ids the domain accepts', () => {
    const gen = new SequentialTokenGenerator();
    expect(() => UuidId.from(gen.generateId())).not.toThrow();
  });
});
