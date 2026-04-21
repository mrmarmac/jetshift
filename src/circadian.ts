import { DateTime } from 'luxon';
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
  const now = DateTime.now();
  const originOffset = now.setZone(originTZ).offset;
  const destOffset = now.setZone(destTZ).offset;
  let diff = destOffset - originOffset;
  if (diff < -720) diff += 1440;
  if (Math.abs(diff) <= 180) return 'minimal';
  return diff > 0 ? 'east' : 'west';
}

export function computeLightWindows(cbtMin: string, direction: Direction): LightWindows {
  if (direction === 'minimal') return { seekLight: null, avoidLight: null };
  const c = toMinutes(cbtMin);
  if (direction === 'east') {
    return {
      seekLight:  { start: fromMinutes(c),       end: fromMinutes(c + 240) },
      avoidLight: { start: fromMinutes(c - 240), end: fromMinutes(c) },
    };
  }
  return {
    seekLight:  { start: fromMinutes(c - 240), end: fromMinutes(c) },
    avoidLight: { start: fromMinutes(c),       end: fromMinutes(c + 240) },
  };
}

export function advanceCBTMinimum(cbtMin: string, direction: Direction, lightCompliance: boolean): string {
  const factor = lightCompliance ? 1 : 0.5;
  const delta = direction === 'east' ?  75 * factor
              : direction === 'west' ? -90 * factor
              : 0;
  return fromMinutes(toMinutes(cbtMin) + delta);
}
