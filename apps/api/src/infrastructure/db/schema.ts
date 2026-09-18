import type { Generated } from 'kysely';

export interface WishlistsTable {
  id: string;
  slug: string;
  title: string;
  owner_token: string;
  key: string;
  key_gen: number;
  created_at: string;
}

export interface ItemsTable {
  id: string;
  wishlist_id: string;
  type: string;
  title: string;
  quantity: number;
  created_at: string;
}

export interface ItemStateTable {
  item_id: string;
  seq: number;
  active_holds: number;
  updated_at: string;
}

export interface HoldsTable {
  id: string;
  item_id: string;
  secret: string;
  session_hash: string;
  idempotency_key: string;
  expires_at: string;
  created_at: string;
}

export interface EventLogTable {
  id: Generated<number>;
  item_id: string;
  seq: number;
  event_type: string;
  payload: string;
  recorded_at: string;
}

export interface Database {
  wishlists: WishlistsTable;
  items: ItemsTable;
  item_state: ItemStateTable;
  holds: HoldsTable;
  event_log: EventLogTable;
}
