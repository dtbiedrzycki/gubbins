import { describe, expect, it } from 'vitest';
import { CreateList } from './CreateList.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { PlainSecretComparer } from '../test-fakes/PlainSecretComparer.js';
import { DomainValidationError, InvalidCreateSecretError } from '../../domain/errors.js';

const NOW = new Date('2026-01-01T00:00:00Z');

function makeUseCase() {
  const { wishlists, unitOfWork } = inMemoryPersistence();
  const useCase = new CreateList(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new PlainSecretComparer(), 'right');
  return { useCase, wishlists };
}

describe('CreateList', () => {
  it('creates an empty wishlist, returning slug/ownerToken/key', async () => {
    const { useCase, wishlists } = makeUseCase();

    const result = await useCase.execute({ listTitle: 'Baby Shower', createSecret: 'right', key: 'guest-key-1' });

    expect(result).toEqual({ slug: 'slug-1', ownerToken: 'owner-token-1', key: 'guest-key-1' });
    const persistedWishlist = await wishlists.findBySlug('slug-1', NOW);
    expect(persistedWishlist?.title).toBe('Baby Shower');
    expect(persistedWishlist?.items).toEqual([]);
  });

  it('stores the chosen key, trimmed', async () => {
    const { useCase, wishlists } = makeUseCase();

    const result = await useCase.execute({ listTitle: 'L', createSecret: 'right', key: ' guest-key-7 ' });

    expect(result.key).toBe('guest-key-7');
    expect((await wishlists.findBySlug('slug-1', NOW))?.key.value).toBe('guest-key-7');
  });

  it('refuses a key the generator could not have made, persisting nothing', async () => {
    const { useCase, wishlists } = makeUseCase();

    await expect(useCase.execute({ listTitle: 'L', createSecret: 'right', key: 'my-own-words' })).rejects.toThrow(DomainValidationError);
    expect(await wishlists.findBySlug('slug-1', NOW)).toBeNull();
  });

  it('accepts a sent secret with surrounding whitespace', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ listTitle: 'L', createSecret: ' right\n', key: 'guest-key-1' })).resolves.toMatchObject({ slug: 'slug-1' });
  });

  it.each([undefined, '', 'wrong'])('refuses creation with a missing or wrong secret (%j), persisting nothing', async (candidate) => {
    const { useCase, wishlists } = makeUseCase();

    await expect(useCase.execute({ listTitle: 'L', createSecret: candidate, key: 'guest-key-1' })).rejects.toThrow(InvalidCreateSecretError);
    expect(await wishlists.findBySlug('slug-1', NOW)).toBeNull();
  });

  it.each([undefined, '', 'anything'])('refuses every creation when no secret is configured (%j)', async (candidate) => {
    const { unitOfWork } = inMemoryPersistence();
    const useCase = new CreateList(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new PlainSecretComparer(), null);

    await expect(useCase.execute({ listTitle: 'L', createSecret: candidate, key: 'guest-key-1' })).rejects.toThrow(InvalidCreateSecretError);
  });

  it('stores the payment handles given at creation', async () => {
    const { useCase, wishlists } = makeUseCase();

    await useCase.execute({ listTitle: 'L', createSecret: 'right', venmoHandle: 'my-venmo', zelleHandle: 'me@example.com' });

    const persisted = await wishlists.findBySlug('slug-1', NOW);
    expect(persisted?.paymentMethods.venmoHandle).toBe('my-venmo');
    expect(persisted?.paymentMethods.zelleHandle).toBe('me@example.com');
  });

  it('stores the list description given at creation', async () => {
    const { useCase, wishlists } = makeUseCase();

    await useCase.execute({ listTitle: 'L', createSecret: 'right', listDescription: 'Ship to 1 Main St' });

    expect((await wishlists.findBySlug('slug-1', NOW))?.description).toBe('Ship to 1 Main St');
  });

  it('persists nothing when a handle is refused', async () => {
    const { useCase, wishlists } = makeUseCase();

    await expect(useCase.execute({ listTitle: 'L', createSecret: 'right', zelleHandle: 'not a handle' })).rejects.toThrow(DomainValidationError);
    expect(await wishlists.findBySlug('slug-1', NOW)).toBeNull();
  });
});
