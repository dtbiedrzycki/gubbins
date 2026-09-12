import { createHash } from 'node:crypto';
import type { Hasher } from '../application/ports/Hasher.js';

export class HasherSha256 implements Hasher {
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
