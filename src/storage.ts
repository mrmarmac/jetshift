import { openDB, type DBSchema } from 'idb';

interface JetShiftDB extends DBSchema {
  plans: {
    key: string;
    value: Record<string, unknown>;
  };
}

function getDB() {
  return openDB<JetShiftDB>('jetshift', 1, {
    upgrade(db) {
      db.createObjectStore('plans', { keyPath: 'id' });
    },
  });
}

export async function savePlan(plan: Record<string, unknown>): Promise<void> {
  await (await getDB()).put('plans', plan);
}

export async function getPlan(id: string): Promise<Record<string, unknown> | null> {
  return (await (await getDB()).get('plans', id)) ?? null;
}

export async function listPlans(): Promise<Record<string, unknown>[]> {
  return (await getDB()).getAll('plans');
}

export async function deletePlan(id: string): Promise<void> {
  await (await getDB()).delete('plans', id);
}

export async function clearPlanStorage(): Promise<void> {
  await (await getDB()).clear('plans');
}
