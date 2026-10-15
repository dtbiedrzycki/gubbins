export interface GuestPiiRecord { id: string; name: string; message: string | null }

/** A guest's name and message, kept outside the event ledger so they can be erased (ADR-0057). */
export interface GuestPiiRepository {
  insert(record: GuestPiiRecord): Promise<void>;
  findById(id: string): Promise<GuestPiiRecord | null>;
}
