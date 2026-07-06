/**
 * Two-process model of sleep regulation (Borbély).
 *
 * Process S — homeostatic sleep pressure: rises exponentially during wake,
 * decays exponentially during sleep.
 * Process C — circadian alertness: sinusoid with its trough at the core body
 * temperature (CBT) minimum and its peak ~12 h later.
 *
 * Combined, they give a per-hour alertness prediction rather than pure phase
 * timing. All times are in minutes.
 */

const RISE_TAU = 1080; // homeostatic build-up time constant, 18 h
const DECAY_TAU = 252; // homeostatic dissipation time constant, 4.2 h

export interface AlertnessParams {
  clockMinutes: number; // 0..1439, minutes since local midnight
  cbtMinMinutes: number; // CBT minimum, minutes since local midnight
  minutesAwake: number; // minutes elapsed since last wake
}

/** Process S during wakefulness: rises from `sAtWake` toward 1. Range [0,1]. */
export function processS(minutesAwake: number, sAtWake = 0.2): number {
  return 1 - (1 - sAtWake) * Math.exp(-minutesAwake / RISE_TAU);
}

/** Process S during sleep: decays from `sAtOnset` toward 0. Range [0,1]. */
export function processSDuringSleep(minutesAsleep: number, sAtOnset: number): number {
  return sAtOnset * Math.exp(-minutesAsleep / DECAY_TAU);
}

/** Process C: circadian alertness in [-1,1]; -1 at CBT min, +1 twelve hours later. */
export function processC(clockMinutes: number, cbtMinMinutes: number): number {
  return -Math.cos((2 * Math.PI * (clockMinutes - cbtMinMinutes)) / 1440);
}

/** Combined alertness on a 0..100 scale. */
export function alertnessScore(p: AlertnessParams): number {
  const c = processC(p.clockMinutes, p.cbtMinMinutes); // -1..1
  const s = 2 * processS(p.minutesAwake) - 1; // -1..1, centred
  const raw = 0.5 * c - 0.5 * s; // -1..1
  return Math.round(Math.min(100, Math.max(0, 50 + 50 * raw)));
}

export function classifyAlertness(score: number): 'low' | 'moderate' | 'high' {
  return score < 35 ? 'low' : score < 65 ? 'moderate' : 'high';
}

export function isNapOpportunity(p: AlertnessParams): boolean {
  return classifyAlertness(alertnessScore(p)) === 'low';
}
