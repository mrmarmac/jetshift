import { DateTime } from 'luxon';
import type { UserInput, Layover } from './types';

export function validateUserInput(input: UserInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!DateTime.local().setZone(input.originTZ).isValid) {
    errors.push('invalid-origin-tz');
  }

  if (input.originTZ === input.destinationTZ) {
    errors.push('same-timezone');
  }

  const dep = DateTime.fromISO(input.departureDateTime);
  const arr = DateTime.fromISO(input.arrivalDateTime);
  if (dep >= arr) {
    errors.push('departure-after-arrival');
  }

  if (input.habitualSleepStart === input.habitualWakeTime) {
    errors.push('invalid-sleep-window');
  }

  const layovers: Layover[] = Array.isArray(input.layovers) ? input.layovers : [];
  for (const layover of layovers) {
    const lArr = DateTime.fromISO(layover.arrivalLocal);
    const lDep = DateTime.fromISO(layover.departureLocal);
    if (lArr < dep || lDep > arr) {
      errors.push('layover-outside-flight-window');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
