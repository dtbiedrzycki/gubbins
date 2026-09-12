import type { Item } from '../../domain/entities/Item.js';

export interface ItemState {
  seq: number;
  activeHolds: number;
  status: 'available' | 'held';
}

export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findById(id: string): Promise<Item | null>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  getState(itemId: string): Promise<ItemState>;
  markHeld(itemId: string, newSeq: number): Promise<void>;
}
