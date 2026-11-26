import type { Generated } from 'kysely';
import type { Actor } from '../../domain/Actor.js';

export interface WishlistsTable {
  id: string;
  slug: string;
  title: string;
  owner_token: string;
  key: string;
  key_gen: number;
  /** The list's Venmo and Zelle handles live in owner_pii (ADR-0090). */
  venmo_owner_pii_ref: string | null;
  zelle_owner_pii_ref: string | null;
  description: string | null;
  created_at: string;
  /** The list's style; defaulted by the database, so typed inserts may leave it out. */
  theme: Generated<string>;
}

export interface ItemsTable {
  id: string;
  wishlist_id: string;
  type: string;
  title: string;
  quantity: number;
  url: string | null;
  price_minor: number | null;
  description: string | null;
  position: number;
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
  units: number;
  purchased_units: number | null;
  expires_at: string;
  extended_at: string | null;
  released_at: string | null;
  purchased_at: string | null;
  buy_undone_at: string | null;
  guest_pii_ref: string | null;
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

export interface OwnerPiiTable {
  id: string;
  wishlist_id: string;
  method: 'venmo' | 'zelle';
  handle: string;
  redacted_at: string | null;
  created_at: string;
}

export interface ContributionsTable {
  id: string;
  item_id: string;
  amount_minor: number;
  session_hash: string;
  idempotency_key: string;
  guest_pii_ref: string;
  owner_pii_ref: string | null;
  pledged_at: string;
  created_at: string;
}

export interface Database {
  wishlists: WishlistsTable;
  items: ItemsTable;
  item_state: ItemStateTable;
  holds: HoldsTable;
  event_log: EventLogTable;
  guest_pii: GuestPiiTable;
  owner_pii: OwnerPiiTable;
  contributions: ContributionsTable;
}
