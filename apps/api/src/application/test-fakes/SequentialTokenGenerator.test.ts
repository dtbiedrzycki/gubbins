import { describe, expect, it } from 'vitest';
import { SequentialTokenGenerator } from './SequentialTokenGenerator.js';

describe('SequentialTokenGenerator', () => {
  it('produces distinct, predictable values per call, incrementing a shared counter', () => {
    const gen = new SequentialTokenGenerator();
    expect(gen.generateId()).toBe('id-1');
    expect(gen.generateId()).toBe('id-2');
    expect(gen.generateSlug()).toBe('slug-3');
    expect(gen.generateOwnerToken()).toBe('owner-token-4');
    expect(gen.generateGuestKey()).toBe('guest-key-5');
    expect(gen.generateHoldSecret()).toBe('hold-secret-6');
    expect(gen.generateSessionId()).toBe('session-7');
  });
});
