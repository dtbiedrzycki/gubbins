import type { Generated } from 'kysely';
import type { Actor } from '../../domain/Actor.js';

export interface WishlistsTable {
  id: string;
  slug: string;
  title: string;
  owner_token: string;
  key: string;
  key_gen: number;
  venmo_handle: string | null;
  zelle_handle: string | null;
  created_at: string;
}

export interface ItemsTable {
  id: string;
  wishlist_id: string;
  type: string;
  title: string;
  quantity: number;
  url: string | null;
  price_minor: number | null;
  created_at: string;
}

export interface ItemStateTable {
  item_id: string;
  seq: number;
  updated_at: string;
}

export interface HoldsTable {
  id: string;
  item_id: string;
  secret: string;
  session_hash: string;
  idempotency_key: string;
  expires_at: string;
  extended_at: string | null;
  released_at: string | null;
  purchased_at: string | null;
  created_at: string;
}

export interface EventLogTable {
  id: Generated<number>;
  item_id: string;
  seq: number;
  event_type: string;
  actor: Actor;
  payload: string;
  recorded_at: string;
}

export interface GuestPiiTable {
  id: string;
  name: string;
  message: string | null;
  redacted_at: string | null;
  created_at: string;
}

export interface Database {
  wishlists: WishlistsTable;
  items: ItemsTable;
  item_state: ItemStateTable;
  holds: HoldsTable;
  event_log: EventLogTable;
  guest_pii: GuestPiiTable;
}
