import { DateTime } from 'luxon';
import { computeLightWindows } from './circadian';
import type { Direction } from './types';

export function computeFlightDuration(dep: string, originTZ: string, arr: string, destTZ: string): number {
  const d = DateTime.fromISO(dep, { zone: originTZ });
  const a = DateTime.fromISO(arr, { zone: destTZ });
  return a.diff(d, 'minutes').minutes;
}

function standardOffset(tz: string): number {
  const jan = DateTime.local(2025, 1, 15).setZone(tz).offset;
  const jul = DateTime.local(2025, 7, 15).setZone(tz).offset;
  return Math.min(jan, jul);
}

export function convertToHomeTime(localDT: string, fromTZ: string, toTZ: string): { homeTime: string; homeDate: string } {
  const dt = DateTime.fromISO(localDT, { zone: fromTZ });
  const adjusted = dt.plus({ minutes: standardOffset(toTZ) - standardOffset(fromTZ) });
  return { homeTime: adjusted.toFormat('HH:mm'), homeDate: adjusted.toISODate() ?? '' };
}

export function layoverPhaseWindows(layovers: unknown[], cbtMin: string, direction: string): unknown[] {
  return [];
}
