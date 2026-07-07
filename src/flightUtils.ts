import { DateTime } from 'luxon';
import { computeLightWindows } from './circadian';
import { toMinutes } from './lib/time';
import type { Action, Direction, Layover } from './types';

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

export interface LayoverWindow {
  airport: string;
  layoverTZ: string;
  arrivalLocal: string;
  departureLocal: string;
  lightActions: Action[];
}

function windowDurationMins(window: { start: string; end: string }): number {
  return ((toMinutes(window.end) - toMinutes(window.start)) + 1440) % 1440;
}

/**
 * If a light window (HH:mm, treated in layover-local clock) overlaps the ground
 * window [arr, dep], return an Action anchored at the overlap start; else null.
 */
function overlapAction(
  type: Action['type'], label: string, priority: Action['priority'],
  window: { start: string; end: string } | null,
  arr: DateTime, dep: DateTime,
): Action | null {
  if (!window) return null;
  const [wh, wm] = window.start.split(':').map(Number);
  const durMins = windowDurationMins(window);
  for (let day = arr.startOf('day'); day <= dep.startOf('day'); day = day.plus({ days: 1 })) {
    const wStart = day.set({ hour: wh ?? 0, minute: wm ?? 0, second: 0, millisecond: 0 });
    const wEnd = wStart.plus({ minutes: durMins });
    const oStart = wStart > arr ? wStart : arr;
    const oEnd = wEnd < dep ? wEnd : dep;
    if (oStart < oEnd) {
      return { type, label, priority, localTime: oStart.toFormat('HH:mm') };
    }
  }
  return null;
}

export function layoverPhaseWindows(layovers: Layover[], cbtMin: string, direction: Direction): LayoverWindow[] {
  if (layovers.length === 0) return [];
  const windows = computeLightWindows(cbtMin, direction);
  return layovers.map(layover => {
    const arr = DateTime.fromISO(layover.arrivalLocal, { zone: layover.layoverTZ });
    const dep = DateTime.fromISO(layover.departureLocal, { zone: layover.layoverTZ });
    const lightActions: Action[] = [];

    const seek = overlapAction('seek-light', 'Seek Light', 'critical', windows.seekLight, arr, dep);
    if (seek) lightActions.push(seek);

    const avoid = overlapAction('avoid-light', 'Avoid Light', 'critical', windows.avoidLight, arr, dep);
    if (avoid) {
      // The avoid-light window is the biological night — a strategic reset window.
      lightActions.push(avoid);
      lightActions.push({ type: 'sleep', label: 'Sleep Opportunity', priority: 'recommended', localTime: avoid.localTime });
      lightActions.push({ type: 'melatonin-flag', label: 'Melatonin', priority: 'optional', localTime: avoid.localTime });
    }

    // Directional layover with no in-ground clock overlap: still flag the intent.
    if (lightActions.length === 0 && windows.avoidLight) {
      lightActions.push({ type: 'avoid-light', label: 'Avoid Light', priority: 'critical', localTime: windows.avoidLight.start });
    }

    return {
      airport: layover.airport,
      layoverTZ: layover.layoverTZ,
      arrivalLocal: layover.arrivalLocal,
      departureLocal: layover.departureLocal,
      lightActions,
    };
  });
}
