import { DateTime } from 'luxon';
import { computeCBTMinimum, detectTravelDirection, computeLightWindows, advanceCBTMinimum, shiftedSleepWindow } from './circadian';
import { generateMealSchedule } from './mealScheduler';
import { assembleHourlyBlocks } from './actions';
import type { UserInput, JetLagPlan, DayPlan, Phase } from './types';

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
