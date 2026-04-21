import type { UserInput, JetLagPlan } from './types';

export function generatePlan(input: UserInput): JetLagPlan {
  return {
    metadata: {
      tzShiftHours: 0,
      direction: 'minimal',
      chronotype: input.chronotype,
      cbtMinBaseline: '',
      generatedAt: new Date().toISOString(),
    },
    days: [],
  };
}
