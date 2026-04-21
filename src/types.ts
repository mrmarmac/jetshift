export type Chronotype = 'early' | 'intermediate' | 'late';
export type Direction = 'east' | 'west' | 'minimal';
export type Phase = 'pre-travel' | 'travel' | 'layover' | 'post-arrival';

export interface Layover {
  airport: string;
  layoverTZ: string;
  arrivalLocal: string;
  departureLocal: string;
}

export interface UserInput {
  originTZ: string;
  destinationTZ: string;
  departureDateTime: string;
  arrivalDateTime: string;
  layovers: Layover[];
  chronotype: Chronotype;
  habitualSleepStart: string;
  habitualWakeTime: string;
}

export interface Action {
  type: 'seek-light' | 'avoid-light' | 'sleep' | 'wake' |
        'meal' | 'fast' | 'caffeine-ok' | 'caffeine-avoid' |
        'melatonin-flag' | 'info';
  label: string;
  detail?: string;
  priority: 'critical' | 'recommended' | 'optional';
  localTime: string;
}

export interface HourBlock {
  hour: number;
  localTime: string;
  actions: Action[];
}

export interface DayPlan {
  dayIndex: number;
  date: string;
  phase: Phase;
  cbtMinEstimate: string;
  hourlyBlocks: HourBlock[];
  daySummary: string;
}

export interface PlanMetadata {
  tzShiftHours: number;
  direction: Direction;
  chronotype: string;
  cbtMinBaseline: string;
  generatedAt: string;
}

export interface JetLagPlan {
  metadata: PlanMetadata;
  days: DayPlan[];
}
