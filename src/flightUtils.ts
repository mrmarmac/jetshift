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

interface LayoverWindow {
  airport: string;
  lightActions: { type: string; label: string; priority: string; localTime: string }[];
}

export function layoverPhaseWindows(layovers: unknown[], cbtMin: string, direction: string): LayoverWindow[] {
  if (layovers.length === 0) return [];
  const windows = computeLightWindows(cbtMin, direction as Direction);
  return (layovers as { airport: string }[]).map(layover => {
    const lightActions: LayoverWindow['lightActions'] = [];
    if (windows.seekLight) {
      lightActions.push({ type: 'seek-light', label: 'Seek Light', priority: 'critical', localTime: windows.seekLight.start });
    }
    if (windows.avoidLight) {
      lightActions.push({ type: 'avoid-light', label: 'Avoid Light', priority: 'critical', localTime: windows.avoidLight.start });
    }
    return { airport: layover.airport, lightActions };
  });
}
