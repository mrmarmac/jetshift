import { toMinutes, fromMinutes } from './lib/time';
import type { Chronotype, Direction } from './types';

export type { Chronotype, Direction };

export interface LightWindows {
  seekLight: { start: string; end: string } | null;
  avoidLight: { start: string; end: string } | null;
}

export function computeCBTMinimum(sleep: string, wake: string, chronotype: Chronotype): string {
  const sleepMins = toMinutes(sleep);
  const wakeMins = toMinutes(wake);
  const duration = ((wakeMins - sleepMins) + 1440) % 1440;
  const offsetMins = duration <= 420 ? 120 : 180;
  const chronoOffset = chronotype === 'early' ? -60
                     : chronotype === 'late'  ?  60 : 0;
  return fromMinutes(wakeMins - offsetMins + chronoOffset);
}

export function detectTravelDirection(originTZ: string, destTZ: string): Direction {
  return 'minimal';
}

export function computeLightWindows(cbtMin: string, direction: Direction): LightWindows {
  return { seekLight: null, avoidLight: null };
}

export function advanceCBTMinimum(cbtMin: string, direction: Direction, lightCompliance: boolean): string {
  return cbtMin;
}
