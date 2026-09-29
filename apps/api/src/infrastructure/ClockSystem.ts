import type { Clock } from '../application/ports/Clock.js';

/**
 * The only place in the API that reads the system time. Use cases get the
 * time from the `Clock` port rather than calling `new Date()`, so tests can
 * pass a `FixedClock` and check time-based behaviour, such as a hold's
 * expiry, against a known instant.
 */
export class ClockSystem implements Clock {
  now(): Date {
    return new Date();
  }
}
