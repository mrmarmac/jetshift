import { toMinutes, fromMinutes } from './lib/time';
import type { Action, Direction } from './types';

export function generateMealSchedule(
  wakeTime: string,
  direction: Direction,
  dayIndex: number,
  opts?: {
    inFlight?: boolean;
    destinationNightStart?: string;
    destinationNightEnd?: string;
    postArrival?: boolean;
    destinationWakeTime?: string;
  },
): Action[] {
  const wake = opts?.postArrival
    ? toMinutes(opts.destinationWakeTime ?? wakeTime)
    : toMinutes(wakeTime);
  const shift = opts?.postArrival ? 0
    : direction === 'east' ? -60 * dayIndex
    : direction === 'west' ?  60 * dayIndex
    : 0;
  const mealTimes = [wake, wake + 300, wake + 600].map(m => m + shift);
  const actions: Action[] = mealTimes.map(m => ({
    type: 'meal' as const,
    label: 'Meal',
    priority: 'recommended' as const,
    localTime: fromMinutes(m),
  }));
  if (opts?.inFlight && opts.destinationNightStart) {
    actions.push({
      type: 'fast',
      label: 'Fast',
      priority: 'recommended',
      localTime: opts.destinationNightStart,
    });
  }
  return actions;
}
