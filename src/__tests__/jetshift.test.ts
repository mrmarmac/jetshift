/**
 * JetShift PWA — TDD Test Suite
 * Framework: Vitest
 * Run: vitest run
 *
 * Organised by module:
 *  1. circadian.ts       — PRC model, CBT minimum, direction logic
 *  2. planner.ts         — 7-day plan generation
 *  3. flightUtils.ts     — timezone arithmetic, layover handling
 *  4. mealScheduler.ts   — meal/fast window generation
 *  5. actions.ts         — hourly block assembly
 *  6. validation.ts      — form input validation
 *  7. storage.ts         — IndexedDB persistence
 *  8. sw.ts              — service worker cache behaviour (integration)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeCBTMinimum, detectTravelDirection, computeLightWindows, advanceCBTMinimum, shiftedSleepWindow } from '../circadian';
import { generatePlan } from '../planner';
import { computeFlightDuration, layoverPhaseWindows, convertToHomeTime } from '../flightUtils';
import { generateMealSchedule } from '../mealScheduler';
import { assembleHourlyBlocks } from '../actions';
import { validateUserInput } from '../validation';
import { savePlan, getPlan, listPlans, deletePlan, clearPlanStorage } from '../storage';
import { TZ_OPTIONS } from '../constants/timezones';
import { processS, processC, alertnessScore, classifyAlertness, isNapOpportunity } from '../twoProcess';
import type { Action } from '../types';
import { DateTime } from 'luxon';

// ─────────────────────────────────────────────
// MODULE 1: circadian.ts
// ─────────────────────────────────────────────

describe('computeCBTMinimum', () => {
  it('returns CBT min wake-3h for sleep >7h, intermediate chronotype', () => {
    // sleep 23:00–07:00 = 8h → wake − 3h = 04:00
    const result = computeCBTMinimum('23:00', '07:00', 'intermediate');
    expect(result).toBe('04:00');
  });

  it('adjusts CBT min earlier for early chronotype', () => {
    const intermediate = computeCBTMinimum('23:00', '07:00', 'intermediate');
    const early = computeCBTMinimum('23:00', '07:00', 'early');
    expect(toMinutes(early)).toBeLessThan(toMinutes(intermediate));
  });

  it('adjusts CBT min later for late chronotype', () => {
    const intermediate = computeCBTMinimum('23:00', '07:00', 'intermediate');
    const late = computeCBTMinimum('23:00', '07:00', 'late');
    expect(toMinutes(late)).toBeGreaterThan(toMinutes(intermediate));
  });

  it('handles sleep window crossing midnight', () => {
    // sleep 22:00–06:00 = 8h → wake − 3h = 03:00
    const result = computeCBTMinimum('22:00', '06:00', 'intermediate');
    expect(result).toBe('03:00');
  });

  it('handles sleep window not crossing midnight (nap / unusual)', () => {
    // sleep 01:00–09:00 = 8h → wake − 3h = 06:00
    const result = computeCBTMinimum('01:00', '09:00', 'intermediate');
    expect(result).toBe('06:00');
  });

  it('uses wake-2h rule for sleep duration ≤7h (boundary)', () => {
    // sleep 00:00–07:00 = 7h → wake − 2h = 05:00
    const result = computeCBTMinimum('00:00', '07:00', 'intermediate');
    expect(result).toBe('05:00');
  });

  it('uses wake-3h rule for sleep duration >7h (boundary)', () => {
    // sleep 23:30–07:00 = 7.5h → wake − 3h = 04:00
    const result = computeCBTMinimum('23:30', '07:00', 'intermediate');
    expect(result).toBe('04:00');
  });
});

describe('detectTravelDirection', () => {
  it('returns east for positive UTC offset difference', () => {
    // London (+0) → Sydney (+10) = +10 hours = east
    expect(detectTravelDirection('Europe/London', 'Australia/Sydney')).toBe('east');
  });

  it('returns west for negative UTC offset difference', () => {
    // London (+0) → New_York (-5) = -5 hours = west
    expect(detectTravelDirection('Europe/London', 'America/New_York')).toBe('west');
  });

  it('returns minimal for shift ≤ 3 hours', () => {
    // London → Paris (+1 hr)
    expect(detectTravelDirection('Europe/London', 'Europe/Paris')).toBe('minimal');
  });

  it('handles dateline crossing westward', () => {
    // LA (-8) → Tokyo (+9) — shorter path east = east
    expect(detectTravelDirection('America/Los_Angeles', 'Asia/Tokyo')).toBe('east');
  });

  it('returns shortest path direction', () => {
    // always picks direction with fewer hours to shift
    const result = detectTravelDirection('America/New_York', 'Asia/Kolkata');
    // NY (-5) → Kolkata (+5:30) = +10.5 east OR -13.5 west → east is shorter
    expect(result).toBe('east');
  });
});

describe('computeLightWindows', () => {
  it('seek-light window falls AFTER CBT min for eastward travel', () => {
    const cbtMin = '04:00';
    const windows = computeLightWindows(cbtMin, 'east');
    const seekStart = toMinutes(windows.seekLight.start);
    const cbtMinMins = toMinutes(cbtMin);
    expect(seekStart).toBeGreaterThanOrEqual(cbtMinMins);
    expect(seekStart).toBeLessThanOrEqual(cbtMinMins + 30); // starts near CBT min
  });

  it('seek-light window falls BEFORE CBT min for westward travel', () => {
    const cbtMin = '04:00';
    const windows = computeLightWindows(cbtMin, 'west');
    const seekEnd = toMinutes(windows.seekLight.end);
    const cbtMinMins = toMinutes(cbtMin);
    expect(seekEnd).toBeLessThanOrEqual(cbtMinMins);
  });

  it('avoid-light window is opposite of seek-light window', () => {
    const windows = computeLightWindows('04:00', 'east');
    expect(windows.avoidLight.start).not.toBe(windows.seekLight.start);
  });

  it('each window spans 4 hours', () => {
    const windows = computeLightWindows('04:00', 'east');
    const seekDuration =
      toMinutes(windows.seekLight.end) - toMinutes(windows.seekLight.start);
    expect(seekDuration).toBe(240);
  });

  it('returns null windows for minimal direction', () => {
    const windows = computeLightWindows('04:00', 'minimal');
    expect(windows.seekLight).toBeNull();
    expect(windows.avoidLight).toBeNull();
  });
});

describe('advanceCBTMinimum', () => {
  it('advances CBT min by ~1.25 hrs/day eastward with light exposure', () => {
    const day0 = '04:00';
    const day1 = advanceCBTMinimum(day0, 'east', true);
    const diff = toMinutes(day0) - toMinutes(day1); // advance = day1 is earlier
    expect(diff).toBeGreaterThanOrEqual(60);
    expect(diff).toBeLessThanOrEqual(90);
  });

  it('delays CBT min by ~1.75 hrs/day westward with light exposure', () => {
    const day0 = '04:00';
    const day1 = advanceCBTMinimum(day0, 'west', true);
    const diff = toMinutes(day1) - toMinutes(day0); // delay = day1 is later
    expect(diff).toBeGreaterThanOrEqual(75);
    expect(diff).toBeLessThanOrEqual(120);
  });

  it('advances less without light exposure compliance', () => {
    const day0 = '04:00';
    const withLight = advanceCBTMinimum(day0, 'east', true);
    const withoutLight = advanceCBTMinimum(day0, 'east', false);
    expect(toMinutes(withLight)).toBeLessThan(toMinutes(withoutLight));
  });

  it('handles wrap-around past midnight', () => {
    const result = advanceCBTMinimum('00:30', 'east', true);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    // advance from 00:30 wraps backward past midnight e.g. 23:15
  });
});

describe('shiftedSleepWindow', () => {
  it('returns the habitual window for minimal direction', () => {
    expect(shiftedSleepWindow('23:00', '07:00', 'minimal', 0, 3)).toEqual({ start: '23:00', end: '07:00' });
  });

  it('advances sleep earlier each pre-travel day for east', () => {
    const starts = [0, 1, 2, 3].map(i => toMinutes(shiftedSleepWindow('23:00', '07:00', 'east', i, 4).start));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeLessThan(starts[i - 1] ?? 0);
    }
  });

  it('delays sleep later each pre-travel day for west', () => {
    const starts = [0, 1, 2, 3].map(i => toMinutes(shiftedSleepWindow('23:00', '07:00', 'west', i, 4).start));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1] ?? 0);
    }
  });

  it('shifts about one hour per day', () => {
    const d0 = toMinutes(shiftedSleepWindow('23:00', '07:00', 'west', 0, 4).start);
    const d1 = toMinutes(shiftedSleepWindow('23:00', '07:00', 'west', 1, 4).start);
    expect(Math.abs(d1 - d0)).toBeGreaterThanOrEqual(45);
    expect(Math.abs(d1 - d0)).toBeLessThanOrEqual(75);
  });
});

// ─────────────────────────────────────────────
// MODULE 2: planner.ts
// ─────────────────────────────────────────────

describe('generatePlan', () => {
  const baseInput = {
    originTZ: 'Europe/London',
    destinationTZ: 'Australia/Sydney',
    departureDateTime: '2025-06-01T10:00:00',
    arrivalDateTime: '2025-06-02T17:00:00',
    layovers: [],
    chronotype: 'intermediate' as const,
    habitualSleepStart: '23:00',
    habitualWakeTime: '07:00',
  };

  it('returns exactly 7 DayPlan entries', () => {
    const plan = generatePlan(baseInput);
    expect(plan.days).toHaveLength(7);
  });

  it('plan starts up to 2 days before departure', () => {
    const plan = generatePlan(baseInput);
    const firstDay = new Date(plan.days[0].date);
    const departure = new Date('2025-06-01');
    const diffDays = (departure.getTime() - firstDay.getTime()) / 86400000;
    expect(diffDays).toBeGreaterThanOrEqual(0);
    expect(diffDays).toBeLessThanOrEqual(2);
  });

  it('each day has 24 hourly blocks', () => {
    const plan = generatePlan(baseInput);
    plan.days.forEach(day => {
      expect(day.hourlyBlocks).toHaveLength(24);
    });
  });

  it('assigns correct phase labels', () => {
    const plan = generatePlan(baseInput);
    const phases = plan.days.map(d => d.phase);
    expect(phases).toContain('pre-travel');
    expect(phases).toContain('travel');
    expect(phases).toContain('post-arrival');
  });

  it('metadata contains correct tzShiftHours for LHR→SYD', () => {
    const plan = generatePlan(baseInput);
    // Sydney is UTC+10/+11 vs London UTC+0/+1 → ~10 hrs east
    expect(plan.metadata.tzShiftHours).toBeGreaterThanOrEqual(9);
    expect(plan.metadata.tzShiftHours).toBeLessThanOrEqual(11);
    expect(plan.metadata.direction).toBe('east');
  });

  it('CBT minimum advances each day for eastward travel', () => {
    const plan = generatePlan(baseInput);
    const cbtTimes = plan.days.map(d => toMinutes(d.cbtMinEstimate));
    // Eastward advance shifts CBT min earlier each day; normalize each step to
    // [-720, 720] so midnight wrap-around doesn't flip the sign.
    const movements = cbtTimes.slice(1).map((t, i) => {
      let d = t - (cbtTimes[i] ?? 0);
      if (d > 720) d -= 1440;
      if (d < -720) d += 1440;
      return d;
    });
    const allSameDirection = movements.every(m => m > 0) || movements.every(m => m < 0);
    expect(allSameDirection).toBe(true);
  });

  it('generates a plan for minimal timezone shift without critical actions', () => {
    const minimalInput = { ...baseInput, destinationTZ: 'Europe/Paris' };
    const plan = generatePlan(minimalInput);
    const criticalActions = plan.days.flatMap(d =>
      d.hourlyBlocks.flatMap(h =>
        h.actions.filter(a => a.priority === 'critical')
      )
    );
    expect(criticalActions).toHaveLength(0);
  });

  it('westward plan has light windows before CBT min', () => {
    const westInput = { ...baseInput, destinationTZ: 'America/New_York' };
    const plan = generatePlan(westInput);
    expect(plan.metadata.direction).toBe('west');
    // seek-light blocks should occur before CBT min hour on day 1
    const day1 = plan.days.find(d => d.phase === 'pre-travel');
    if (day1) {
      const seekBlocks = day1.hourlyBlocks.filter(h =>
        h.actions.some(a => a.type === 'seek-light')
      );
      const cbtHour = toMinutes(day1.cbtMinEstimate) / 60;
      seekBlocks.forEach(b => expect(b.hour).toBeLessThan(cbtHour));
    }
  });
});

describe('generatePlan pre-travel shifting', () => {
  const baseInput = {
    originTZ: 'Europe/London',
    destinationTZ: 'Australia/Sydney',
    departureDateTime: '2025-06-01T10:00:00',
    arrivalDateTime: '2025-06-02T17:00:00',
    layovers: [],
    chronotype: 'intermediate' as const,
    habitualSleepStart: '23:00',
    habitualWakeTime: '07:00',
  };

  it('defaults to 2 pre-travel days and 7 total days', () => {
    const plan = generatePlan(baseInput);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.filter(d => d.phase === 'pre-travel')).toHaveLength(2);
  });

  it('expands the plan when preTravelDays is 4', () => {
    const plan = generatePlan({ ...baseInput, preTravelDays: 4 });
    expect(plan.days).toHaveLength(9);
    expect(plan.days.filter(d => d.phase === 'pre-travel')).toHaveLength(4);
    const firstDay = new Date(plan.days[0].date);
    const departure = new Date('2025-06-01');
    const diffDays = (departure.getTime() - firstDay.getTime()) / 86400000;
    expect(diffDays).toBe(4);
  });

  it('progressively shifts pre-travel sleep windows toward destination', () => {
    const plan = generatePlan({ ...baseInput, preTravelDays: 4 });
    const preStarts = plan.days
      .filter(d => d.phase === 'pre-travel')
      .map(d => toMinutes(d.sleepWindow?.start ?? '00:00'));
    // eastward travel advances sleep earlier each day → strictly decreasing
    for (let i = 1; i < preStarts.length; i++) {
      expect(preStarts[i]).toBeLessThan(preStarts[i - 1] ?? 0);
    }
  });
});

// ─────────────────────────────────────────────
// MODULE 3: flightUtils.ts
// ─────────────────────────────────────────────

describe('computeFlightDuration', () => {
  it('returns correct duration in minutes', () => {
    const mins = computeFlightDuration(
      '2025-06-01T10:00:00',
      'Europe/London',
      '2025-06-02T17:00:00',
      'Australia/Sydney'
    );
    // LHR→SYD approx 21–22 hrs
    expect(mins).toBeGreaterThan(1200); // > 20 hrs
    expect(mins).toBeLessThan(1440);    // < 24 hrs
  });

  it('handles same-day short-haul correctly', () => {
    const mins = computeFlightDuration(
      '2025-06-01T08:00:00',
      'Europe/London',
      '2025-06-01T10:00:00',
      'Europe/Paris'
    );
    expect(mins).toBe(60); // 2hr flight minus 1hr timezone = 1hr actual
  });
});

describe('layoverPhaseWindows', () => {
  it('generates layover phase for each layover', () => {
    const layovers = [
      {
        airport: 'DXB',
        layoverTZ: 'Asia/Dubai',
        arrivalLocal: '2025-06-01T21:00:00',
        departureLocal: '2025-06-02T03:00:00',
      },
    ];
    const windows = layoverPhaseWindows(layovers, '04:00', 'east');
    expect(windows).toHaveLength(1);
    expect(windows[0].airport).toBe('DXB');
    expect(windows[0].lightActions).toBeDefined();
  });

  it('flags seek-light or avoid-light appropriately during layover', () => {
    const layovers = [
      {
        airport: 'DXB',
        layoverTZ: 'Asia/Dubai',
        arrivalLocal: '2025-06-01T21:00:00',
        departureLocal: '2025-06-02T03:00:00',
      },
    ];
    const windows = layoverPhaseWindows(layovers, '04:00', 'east');
    const actionTypes = windows[0].lightActions.map((a: Action) => a.type);
    expect(
      actionTypes.some(t => t === 'seek-light' || t === 'avoid-light')
    ).toBe(true);
  });

  it('returns empty array for no layovers', () => {
    expect(layoverPhaseWindows([], '04:00', 'east')).toEqual([]);
  });
});

describe('convertToHomeTime', () => {
  it('correctly converts destination local time to home time', () => {
    // Sydney 08:00 → London time (UTC+10 → UTC+0) = previous day 22:00
    const result = convertToHomeTime(
      '2025-06-02T08:00:00',
      'Australia/Sydney',
      'Europe/London'
    );
    expect(result.homeTime).toBe('22:00');
  });

  it('handles DST transitions without throwing', () => {
    expect(() =>
      convertToHomeTime(
        '2025-03-30T02:30:00', // UK DST transition
        'Europe/London',
        'America/New_York'
      )
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// MODULE 4: mealScheduler.ts
// ─────────────────────────────────────────────

describe('generateMealSchedule', () => {
  it('produces 3 meal blocks per day', () => {
    const meals = generateMealSchedule('07:00', 'east', 0);
    expect(meals.filter(a => a.type === 'meal')).toHaveLength(3);
  });

  it('shifts meal times 1 hr/day toward destination for eastward travel', () => {
    const day0Meals = generateMealSchedule('07:00', 'east', 0);
    const day1Meals = generateMealSchedule('07:00', 'east', 1);
    const day0First = toMinutes(day0Meals[0].localTime);
    const day1First = toMinutes(day1Meals[0].localTime);
    expect(day1First).toBeLessThan(day0First); // advancing = earlier
  });

  it('shifts meal times 1 hr/day later for westward travel', () => {
    const day0Meals = generateMealSchedule('07:00', 'west', 0);
    const day1Meals = generateMealSchedule('07:00', 'west', 1);
    const day0First = toMinutes(day0Meals[0].localTime);
    const day1First = toMinutes(day1Meals[0].localTime);
    expect(day1First).toBeGreaterThan(day0First);
  });

  it('generates fast window during destination night in-flight phase', () => {
    const actions = generateMealSchedule('07:00', 'east', 0, { inFlight: true, destinationNightStart: '22:00', destinationNightEnd: '06:00' });
    expect(actions.some(a => a.type === 'fast')).toBe(true);
  });

  it('meal times are on destination schedule from post-arrival day 1', () => {
    const meals = generateMealSchedule('07:00', 'east', 0, { postArrival: true, destinationWakeTime: '07:00' });
    // breakfast should be near 07:00–09:00 local destination time
    const breakfast = meals[0];
    const hour = parseInt(breakfast.localTime.split(':')[0]);
    expect(hour).toBeGreaterThanOrEqual(7);
    expect(hour).toBeLessThanOrEqual(9);
  });
});

// ─────────────────────────────────────────────
// MODULE 5: actions.ts
// ─────────────────────────────────────────────

describe('assembleHourlyBlocks', () => {
  it('produces exactly 24 blocks numbered 0–23', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-01',
      phase: 'pre-travel',
      cbtMin: '04:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '04:00', end: '08:00' }, avoidLight: { start: '00:00', end: '04:00' } },
      sleepWindow: { start: '23:00', end: '07:00' },
      mealActions: [],
    });
    expect(blocks).toHaveLength(24);
    expect(blocks[0].hour).toBe(0);
    expect(blocks[23].hour).toBe(23);
  });

  it('seek-light action appears in correct hours', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-01',
      phase: 'pre-travel',
      cbtMin: '04:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '04:00', end: '08:00' }, avoidLight: { start: '00:00', end: '04:00' } },
      sleepWindow: { start: '23:00', end: '07:00' },
      mealActions: [],
    });
    const seekHours = blocks
      .filter(b => b.actions.some(a => a.type === 'seek-light'))
      .map(b => b.hour);
    seekHours.forEach(h => {
      expect(h).toBeGreaterThanOrEqual(4);
      expect(h).toBeLessThan(8);
    });
  });

  it('avoid-light and sleep blocks do not overlap', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-01',
      phase: 'pre-travel',
      cbtMin: '04:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '04:00', end: '08:00' }, avoidLight: { start: '00:00', end: '04:00' } },
      sleepWindow: { start: '23:00', end: '07:00' },
      mealActions: [],
    });
    blocks.forEach(b => {
      const types = b.actions.map(a => a.type);
      const hasAvoid = types.includes('avoid-light');
      const hasSleep = types.includes('sleep');
      // Sleep already implies light avoidance — no redundant avoid-light during sleep
      expect(hasAvoid && hasSleep).toBe(false);
    });
  });

  it('melatonin flag placed at destination bedtime on post-arrival days', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-03',
      phase: 'post-arrival',
      cbtMin: '05:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '05:00', end: '09:00' }, avoidLight: { start: '01:00', end: '05:00' } },
      sleepWindow: { start: '22:00', end: '06:00' },
      mealActions: [],
      melatoninHour: 21,
    });
    const melatoninBlock = blocks.find(b =>
      b.actions.some(a => a.type === 'melatonin-flag')
    );
    expect(melatoninBlock).toBeDefined();
    expect(melatoninBlock?.hour).toBe(21);
  });

  it('caffeine-avoid blocks appear within 6 hrs of sleep start', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-01',
      phase: 'pre-travel',
      cbtMin: '04:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '04:00', end: '08:00' }, avoidLight: { start: '00:00', end: '04:00' } },
      sleepWindow: { start: '22:00', end: '06:00' },
      mealActions: [],
    });
    const caffeineAvoidBlocks = blocks.filter(b =>
      b.actions.some(a => a.type === 'caffeine-avoid')
    );
    caffeineAvoidBlocks.forEach(b => {
      // Should appear hours 16–22 (6 hrs before 22:00 sleep)
      expect(b.hour).toBeGreaterThanOrEqual(16);
    });
  });
});

// ─────────────────────────────────────────────
// MODULE 6: validation.ts
// ─────────────────────────────────────────────

describe('validateUserInput', () => {
  const valid = {
    originTZ: 'Europe/London',
    destinationTZ: 'Australia/Sydney',
    departureDateTime: '2025-06-01T10:00:00',
    arrivalDateTime: '2025-06-02T17:00:00',
    layovers: [],
    chronotype: 'intermediate',
    habitualSleepStart: '23:00',
    habitualWakeTime: '07:00',
  };

  it('passes for valid input', () => {
    expect(validateUserInput(valid).valid).toBe(true);
  });

  it('fails when departure is after arrival', () => {
    const result = validateUserInput({
      ...valid,
      departureDateTime: '2025-06-02T10:00:00',
      arrivalDateTime: '2025-06-01T17:00:00',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('departure-after-arrival');
  });

  it('fails when origin and destination timezone are identical', () => {
    const result = validateUserInput({
      ...valid,
      destinationTZ: 'Europe/London',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('same-timezone');
  });

  it('fails for invalid IANA timezone string', () => {
    const result = validateUserInput({ ...valid, originTZ: 'Not/AZone' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid-origin-tz');
  });

  it('fails when wake time equals sleep time', () => {
    const result = validateUserInput({
      ...valid,
      habitualSleepStart: '08:00',
      habitualWakeTime: '08:00',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid-sleep-window');
  });

  it('fails when layover time falls outside flight window', () => {
    const result = validateUserInput({
      ...valid,
      layovers: [{
        airport: 'DXB',
        layoverTZ: 'Asia/Dubai',
        arrivalLocal: '2025-06-03T21:00:00', // after arrival
        departureLocal: '2025-06-04T03:00:00',
      }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('layover-outside-flight-window');
  });

  it('accepts missing layovers gracefully', () => {
    expect(validateUserInput({ ...valid, layovers: undefined as any }).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────
// MODULE 7: storage.ts
// ─────────────────────────────────────────────

describe('PlanStorage (IndexedDB)', () => {
  beforeEach(async () => {
    await clearPlanStorage();
  });

  it('saves and retrieves a plan by id', async () => {
    const plan = { id: 'test-001', metadata: { direction: 'east' }, days: [] };
    await savePlan(plan);
    const retrieved = await getPlan('test-001');
    expect(retrieved?.id).toBe('test-001');
    expect(retrieved?.metadata.direction).toBe('east');
  });

  it('overwrites existing plan with same id', async () => {
    await savePlan({ id: 'test-001', metadata: { direction: 'east' }, days: [] });
    await savePlan({ id: 'test-001', metadata: { direction: 'west' }, days: [] });
    const retrieved = await getPlan('test-001');
    expect(retrieved?.metadata.direction).toBe('west');
  });

  it('returns null for non-existent id', async () => {
    const result = await getPlan('does-not-exist');
    expect(result).toBeNull();
  });

  it('lists all saved plans', async () => {
    await savePlan({ id: 'a', metadata: {}, days: [] });
    await savePlan({ id: 'b', metadata: {}, days: [] });
    const all = await listPlans();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('deletes a plan by id', async () => {
    await savePlan({ id: 'to-delete', metadata: {}, days: [] });
    await deletePlan('to-delete');
    expect(await getPlan('to-delete')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// MODULE 8: Service Worker (integration)
// ─────────────────────────────────────────────

describe('Service Worker caching', () => {
  it('caches static shell assets on install', async () => {
    const cache = await caches.open('jetshift-v1');
    const keys = await cache.keys();
    const urls = keys.map(r => new URL(r.url).pathname);
    expect(urls).toContain('/');
    expect(urls).toContain('/index.html');
    expect(urls.some(u => u.endsWith('.js'))).toBe(true);
    expect(urls.some(u => u.endsWith('.css'))).toBe(true);
  });

  it('serves cached response when offline', async () => {
    // Simulate offline by intercepting fetch
    const response = await fetch('/index.html');
    expect(response.ok).toBe(true);
    expect(response.headers.get('x-from-cache')).toBe('true');
  });

  it('manifest.json is accessible', async () => {
    const response = await fetch('/manifest.json');
    expect(response.ok).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe('JetShift');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// MODULE 9: constants/timezones.ts (Stage 10)
// ─────────────────────────────────────────────

describe('TZ_OPTIONS', () => {
  it('exposes Melbourne, London, and Berlin', () => {
    const values = TZ_OPTIONS.map(o => o.value);
    expect(values).toContain('Australia/Melbourne');
    expect(values).toContain('Europe/London');
    expect(values).toContain('Europe/Berlin');
  });

  it('all option values are valid IANA zones', () => {
    TZ_OPTIONS.forEach(o => {
      expect(DateTime.local().setZone(o.value).isValid).toBe(true);
    });
  });

  it('option values are distinct', () => {
    const values = TZ_OPTIONS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ─────────────────────────────────────────────
// MODULE 10: twoProcess.ts (Stage 11)
// ─────────────────────────────────────────────

describe('twoProcess', () => {
  it('processS rises monotonically with wakefulness', () => {
    expect(processS(60)).toBeLessThan(processS(600));
    expect(processS(600)).toBeLessThan(processS(1080));
  });

  it('processS stays within [0,1]', () => {
    [0, 60, 300, 720, 1080, 1440, 2000].forEach(m => {
      expect(processS(m)).toBeGreaterThanOrEqual(0);
      expect(processS(m)).toBeLessThanOrEqual(1);
    });
  });

  it('processC troughs at the CBT minimum', () => {
    const cbt = 240;
    expect(processC(cbt, cbt)).toBeCloseTo(-1, 5);
    expect(processC(cbt, cbt)).toBeLessThan(processC(cbt + 720, cbt));
  });

  it('alertnessScore stays within [0,100]', () => {
    for (let clock = 0; clock < 1440; clock += 30) {
      const s = alertnessScore({ clockMinutes: clock, cbtMinMinutes: 240, minutesAwake: 480 });
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('alertness falls after prolonged wakefulness', () => {
    const base = { clockMinutes: 720, cbtMinMinutes: 240 };
    const fresh = alertnessScore({ ...base, minutesAwake: 60 });
    const tired = alertnessScore({ ...base, minutesAwake: 960 });
    expect(tired).toBeLessThan(fresh);
  });

  it('flags a nap opportunity near the trough when tired, not at the peak when fresh', () => {
    const cbt = 240;
    expect(isNapOpportunity({ clockMinutes: cbt, cbtMinMinutes: cbt, minutesAwake: 960 })).toBe(true);
    expect(isNapOpportunity({ clockMinutes: cbt + 720, cbtMinMinutes: cbt, minutesAwake: 60 })).toBe(false);
  });

  it('classifyAlertness bins low/moderate/high', () => {
    expect(classifyAlertness(20)).toBe('low');
    expect(classifyAlertness(50)).toBe('moderate');
    expect(classifyAlertness(80)).toBe('high');
  });
});

describe('assembleHourlyBlocks alertness', () => {
  it('attaches an alertness score to every wake-hour block', () => {
    const blocks = assembleHourlyBlocks({
      date: '2025-06-01',
      phase: 'pre-travel',
      cbtMin: '04:00',
      direction: 'east',
      lightWindows: { seekLight: { start: '04:00', end: '08:00' }, avoidLight: { start: '00:00', end: '04:00' } },
      sleepWindow: { start: '23:00', end: '07:00' },
      mealActions: [],
    });
    blocks.forEach(b => {
      const asleep = b.actions.some(a => a.type === 'sleep');
      if (!asleep) {
        expect(typeof b.alertness).toBe('number');
        expect(b.alertness).toBeGreaterThanOrEqual(0);
        expect(b.alertness).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ─────────────────────────────────────────────
// HELPERS (shared test utilities)
// ─────────────────────────────────────────────

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
