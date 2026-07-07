import { DateTime } from 'luxon';
import { computeCBTMinimum, detectTravelDirection, computeLightWindows, advanceCBTMinimum, shiftedSleepWindow } from './circadian';
import { generateMealSchedule } from './mealScheduler';
import { assembleHourlyBlocks } from './actions';
import { layoverPhaseWindows } from './flightUtils';
import type { UserInput, JetLagPlan, DayPlan, HourBlock, Action, Phase } from './types';

function buildLayoverBlocks(actions: Action[]): HourBlock[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const localTime = `${hour.toString().padStart(2, '0')}:00`;
    const hourActions = actions.filter(a => parseInt(a.localTime.split(':')[0] ?? '0') === hour);
    return { hour, localTime, actions: hourActions };
  });
}

export function generatePlan(input: UserInput): JetLagPlan {
  const direction = detectTravelDirection(input.originTZ, input.destinationTZ);

  const originOffset = DateTime.now().setZone(input.originTZ).offset;
  const destOffset = DateTime.now().setZone(input.destinationTZ).offset;
  let rawDiff = destOffset - originOffset;
  if (rawDiff < -720) rawDiff += 1440;
  const tzShiftHours = rawDiff / 60;

  const cbtBaseline = computeCBTMinimum(
    input.habitualSleepStart,
    input.habitualWakeTime,
    input.chronotype,
  );

  const departure = DateTime.fromISO(input.departureDateTime, { zone: input.originTZ });

  const preDays = input.preTravelDays ?? 2;
  const totalDays = preDays + 1 /* travel */ + 4 /* post-arrival */;

  const days: DayPlan[] = [];
  let cbtCurrent = cbtBaseline;

  for (let i = 0; i < totalDays; i++) {
    const dayDate = departure.plus({ days: i - preDays });
    const phase: Phase = i < preDays ? 'pre-travel' : i === preDays ? 'travel' : 'post-arrival';

    const lightWindows = computeLightWindows(cbtCurrent, direction);

    const sleepWindow = phase === 'pre-travel'
      ? shiftedSleepWindow(input.habitualSleepStart, input.habitualWakeTime, direction, i, preDays)
      : { start: input.habitualSleepStart, end: input.habitualWakeTime };

    const mealActions = generateMealSchedule(
      input.habitualWakeTime,
      direction,
      i,
      phase === 'post-arrival'
        ? { postArrival: true, destinationWakeTime: input.habitualWakeTime }
        : undefined,
    );

    const hourlyBlocks = assembleHourlyBlocks({
      date: dayDate.toISODate() ?? '',
      phase,
      cbtMin: cbtCurrent,
      direction,
      lightWindows,
      sleepWindow,
      mealActions,
    });

    days.push({
      dayIndex: i,
      date: dayDate.toISODate() ?? '',
      phase,
      cbtMinEstimate: cbtCurrent,
      hourlyBlocks,
      daySummary: '',
      sleepWindow,
    });

    cbtCurrent = advanceCBTMinimum(cbtCurrent, direction, true);
  }

  if (input.layovers.length > 0) {
    const travelIdx = days.findIndex(d => d.phase === 'travel');
    const travelDay = days[travelIdx];
    if (travelDay) {
      const windows = layoverPhaseWindows(input.layovers, travelDay.cbtMinEstimate, direction);
      const layoverDays: DayPlan[] = windows.map(w => ({
        dayIndex: 0, // renumbered below
        date: DateTime.fromISO(w.arrivalLocal, { zone: w.layoverTZ }).toISODate() ?? travelDay.date,
        phase: 'layover' as Phase,
        cbtMinEstimate: travelDay.cbtMinEstimate,
        hourlyBlocks: buildLayoverBlocks(w.lightActions),
        daySummary: '',
      }));
      days.splice(travelIdx + 1, 0, ...layoverDays);
      days.forEach((d, idx) => { d.dayIndex = idx; });
    }
  }

  return {
    metadata: {
      tzShiftHours,
      direction,
      chronotype: input.chronotype,
      cbtMinBaseline: cbtBaseline,
      generatedAt: new Date().toISOString(),
    },
    days,
  };
}
