import { DateTime } from 'luxon';
import { computeLightWindows } from './circadian';
import type { Direction } from './types';

export function computeFlightDuration(dep: string, originTZ: string, arr: string, destTZ: string): number {
  const d = DateTime.fromISO(dep, { zone: originTZ });
  const a = DateTime.fromISO(arr, { zone: destTZ });
  return a.diff(d, 'minutes').minutes;
}

export function convertToHomeTime(localDT: string, fromTZ: string, toTZ: string): { homeTime: string; homeDate: string } {
  return { homeTime: '', homeDate: '' };
}

export function layoverPhaseWindows(layovers: unknown[], cbtMin: string, direction: string): unknown[] {
  return [];
}
