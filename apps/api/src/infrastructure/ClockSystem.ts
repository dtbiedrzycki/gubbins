import type { Clock } from '../application/ports/Clock.js';

export class ClockSystem implements Clock {
  now(): Date {
    return new Date();
  }
}
