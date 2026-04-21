import { DateTime } from 'luxon';
import { computeCBTMinimum, detectTravelDirection, computeLightWindows, advanceCBTMinimum } from './circadian';
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

  const days: DayPlan[] = [];
  let cbtCurrent = cbtBaseline;

  for (let i = 0; i < 7; i++) {
    const dayDate = departure.plus({ days: i - 2 });
    const phase: Phase = i < 2 ? 'pre-travel' : i === 2 ? 'travel' : 'post-arrival';

    const lightWindows = computeLightWindows(cbtCurrent, direction);

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
      sleepWindow: { start: input.habitualSleepStart, end: input.habitualWakeTime },
      mealActions,
    });

    days.push({
      dayIndex: i,
      date: dayDate.toISODate() ?? '',
      phase,
      cbtMinEstimate: cbtCurrent,
      hourlyBlocks,
      daySummary: '',
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
