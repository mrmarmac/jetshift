import type { Chronotype, Direction } from './types';

export type { Chronotype, Direction };

export interface LightWindows {
  seekLight: { start: string; end: string } | null;
  avoidLight: { start: string; end: string } | null;
}

export function computeCBTMinimum(sleep: string, wake: string, chronotype: Chronotype): string {
  return '';
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
