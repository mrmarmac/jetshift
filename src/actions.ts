import { toMinutes, fromMinutes } from './lib/time';
import { alertnessScore, isNapOpportunity } from './twoProcess';
import type { Action, HourBlock, Phase, Direction } from './types';

interface LightWindow {
  start: string;
  end: string;
}

interface AssembleParams {
  date: string;
  phase: Phase;
  cbtMin: string;
  direction: Direction;
  lightWindows: { seekLight: LightWindow | null; avoidLight: LightWindow | null };
  sleepWindow: { start: string; end: string };
  mealActions: Action[];
  melatoninHour?: number;
}

function hourInWindow(hour: number, start: string, end: string): boolean {
  const s = toMinutes(start) / 60;
  const e = toMinutes(end) / 60;
  if (s < e) return hour >= s && hour < e;
  return hour >= s || hour < e;
}

export function assembleHourlyBlocks(params: AssembleParams): HourBlock[] {
  const { lightWindows, sleepWindow, mealActions, melatoninHour } = params;
  const caffeineStartStr = fromMinutes(toMinutes(sleepWindow.start) - 360);

  return Array.from({ length: 24 }, (_, hour) => {
    const localTime = `${hour.toString().padStart(2, '0')}:00`;
    const actions: Action[] = [];

    const inSleep = hourInWindow(hour, sleepWindow.start, sleepWindow.end);
    let alertness: number | undefined;

    if (inSleep) {
      actions.push({ type: 'sleep', label: 'Sleep', priority: 'recommended', localTime });
    } else {
      if (lightWindows.seekLight && hourInWindow(hour, lightWindows.seekLight.start, lightWindows.seekLight.end)) {
        actions.push({ type: 'seek-light', label: 'Seek Light', priority: 'critical', localTime });
      }
      if (lightWindows.avoidLight && hourInWindow(hour, lightWindows.avoidLight.start, lightWindows.avoidLight.end)) {
        actions.push({ type: 'avoid-light', label: 'Avoid Light', priority: 'critical', localTime });
      }
      if (hourInWindow(hour, caffeineStartStr, sleepWindow.start)) {
        actions.push({ type: 'caffeine-avoid', label: 'Avoid Caffeine', priority: 'optional', localTime });
      }

      const minutesAwake = ((hour * 60) - toMinutes(sleepWindow.end) + 1440) % 1440;
      const alertnessParams = { clockMinutes: hour * 60, cbtMinMinutes: toMinutes(params.cbtMin), minutesAwake };
      alertness = alertnessScore(alertnessParams);
      if (isNapOpportunity(alertnessParams)) {
        actions.push({ type: 'info', label: 'Nap opportunity', priority: 'optional', localTime });
      }
    }

    mealActions
      .filter(a => parseInt(a.localTime.split(':')[0] ?? '0') === hour)
      .forEach(a => actions.push(a));

    if (melatoninHour !== undefined && hour === melatoninHour) {
      actions.push({ type: 'melatonin-flag', label: 'Melatonin', priority: 'optional', localTime });
    }

    return { hour, localTime, actions, alertness };
  });
}
