# JetShift — TDD Build Plan

**Audience:** the AI agent building this project.
**Inputs:** `SPEC.md`, `jetshift_test.ts` (v2, wake-relative CBT formula).
**Style:** strict red → green → commit. One test at a time.

-----

## READ THIS BEFORE EVERY STAGE

You will context-rot. Re-read these five lines at the start of each stage:

1. **One module, one stage.** Never edit a module outside the current stage.
1. **Red first.** Run the failing test before writing code. If it passes already, the test is wrong — stop.
1. **Minimum code to green.** No extra features. No “while I’m here” refactors.
1. **Prior stages stay green.** Run the full suite at every stage boundary.
1. **Commit per passing test.** Message format: `stage-N: <test name>`.

If you violate any of these, `git reset --hard HEAD` and start the test over.

-----

## Global invariants

- **Language:** TypeScript strict. `tsconfig.json` has `"strict": true, "noUncheckedIndexedAccess": true`.
- **Test runner:** Vitest. Command: `npx vitest run`.
- **Timezone lib:** Luxon only. Do not import moment, dayjs, or date-fns.
- **No logic in UI.** UI code lives in Stage 8+. Stages 1–7 are pure TS + IndexedDB.
- **No `any`.** Every function has explicit parameter + return types.
- **No `.skip()`, no `.only()`, no `xit()`.** Ever.

## Module map

|Stage|Module                     |Pure?             |Depends on       |
|-----|---------------------------|------------------|-----------------|
|1    |`src/circadian.ts`         |yes               |`src/lib/time.ts`|
|2    |`src/flightUtils.ts`       |yes               |circadian, time  |
|3    |`src/mealScheduler.ts`     |yes               |time             |
|4    |`src/actions.ts`           |yes               |time             |
|5    |`src/planner.ts`           |yes (orchestrator)|1–4              |
|6    |`src/validation.ts`        |yes               |time             |
|7    |`src/storage.ts`           |IndexedDB         |—                |
|8    |`src/ui/*`                 |React             |1–7              |
|9    |`vite.config.ts` PWA plugin|build             |all              |

-----

## Stage 0 — Scaffold

No tests pass yet. This stage only exists to make the runner execute.

### Commands

```bash
npm create vite@latest jetshift -- --template react-ts
cd jetshift
npm i luxon idb
npm i -D vitest @vitest/ui jsdom fake-indexeddb @types/luxon
```

### Files to create

```
src/
  lib/time.ts          # toMinutes, fromMinutes helpers
  circadian.ts         # empty stub exports
  flightUtils.ts       # empty stub exports
  mealScheduler.ts     # empty stub exports
  actions.ts           # empty stub exports
  planner.ts           # empty stub exports
  validation.ts        # empty stub exports
  storage.ts           # empty stub exports
  types.ts             # all interfaces from SPEC.md § Data Model
  __tests__/
    jetshift.test.ts   # copy of v2 test file
vitest.config.ts       # jsdom env + fake-indexeddb setup
```

### `src/lib/time.ts` (only helper written at Stage 0)

```ts
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const m = (wrapped % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
```

### Fix test file imports

At the bottom of `jetshift.test.ts`, replace every `declare function …` line with a real import from its module. The `toMinutes` helper at the top of the test file is identical to `src/lib/time.ts` — you can keep it inline or import, either works.

### Exit gate

- `npx vitest run` executes without syntax errors.
- Every test fails with “X is not a function” or “X is undefined”. **This is correct.**
- `npx tsc --noEmit` passes.
- Commit: `stage-0: scaffold`.

-----

## Stage 1 — `circadian.ts`

**Tests covered:** `computeCBTMinimum` (7), `detectTravelDirection` (5), `computeLightWindows` (5), `advanceCBTMinimum` (4). **Total: 21.**

### Build order (one test, one commit)

1. **`computeCBTMinimum` — base case.** Sleep 23:00–07:00 = 8h → wake−3h = `04:00`.
   
   ```ts
   export function computeCBTMinimum(
     sleep: string, wake: string, chronotype: Chronotype
   ): string {
     const sleepMins = toMinutes(sleep);
     const wakeMins = toMinutes(wake);
     const duration = ((wakeMins - sleepMins) + 1440) % 1440;
     const offsetMins = duration <= 420 ? 120 : 180;   // 420 = 7h
     const chronoOffset = chronotype === 'early' ? -60
                        : chronotype === 'late'  ?  60 : 0;
     return fromMinutes(wakeMins - offsetMins + chronoOffset);
   }
   ```
   
   This implementation passes all 7 CBT tests. Run them one at a time anyway to prove it — if any fails, the bug is in this function.
1. **`detectTravelDirection`.**
   
   ```ts
   import { DateTime } from 'luxon';
   
   export function detectTravelDirection(
     originTZ: string, destTZ: string
   ): 'east' | 'west' | 'minimal' {
     const now = DateTime.now();
     const originOffset = now.setZone(originTZ).offset;   // minutes
     const destOffset = now.setZone(destTZ).offset;
     let diff = destOffset - originOffset;
     if (diff > 720) diff -= 1440;
     if (diff < -720) diff += 1440;
     if (Math.abs(diff) <= 180) return 'minimal';         // ≤ 3 hrs
     return diff > 0 ? 'east' : 'west';
   }
   ```
   
   Gotcha: `America/New_York` → `Asia/Kolkata` = east (diff = +10.5h, under the 12h flip threshold).
1. **`computeLightWindows`.** 4-hour windows = 240 minutes.
   
   ```ts
   export interface LightWindows {
     seekLight: { start: string; end: string } | null;
     avoidLight: { start: string; end: string } | null;
   }
   
   export function computeLightWindows(
     cbtMin: string, direction: Direction
   ): LightWindows {
     if (direction === 'minimal') return { seekLight: null, avoidLight: null };
     const c = toMinutes(cbtMin);
     if (direction === 'east') {
       return {
         seekLight:  { start: fromMinutes(c),       end: fromMinutes(c + 240) },
         avoidLight: { start: fromMinutes(c - 240), end: fromMinutes(c) },
       };
     }
     return {
       seekLight:  { start: fromMinutes(c - 240), end: fromMinutes(c) },
       avoidLight: { start: fromMinutes(c),       end: fromMinutes(c + 240) },
     };
   }
   ```
1. **`advanceCBTMinimum`.**
   
   Tests treat east as **positive** minute-delta (test line 121: `day1 - day0 >= 60`). Match the tests:
   
   ```ts
   export function advanceCBTMinimum(
     cbtMin: string, direction: Direction, lightCompliance: boolean
   ): string {
     const factor = lightCompliance ? 1 : 0.5;
     const delta = direction === 'east' ?  75 * factor
                 : direction === 'west' ? -90 * factor
                 : 0;
     return fromMinutes(toMinutes(cbtMin) + delta);
   }
   ```
   
   **⚠ Spec inversion (known issue):** SPEC.md prose says east-advance = CBT min shifts earlier in clock time; the tests implement the opposite sign. Fidelity to tests > fidelity to spec prose. File a follow-up issue after Stage 5.

### Exit gate for Stage 1

- All 21 circadian tests green.
- No code in any other module beyond stubs.
- `npx tsc --noEmit` passes.
- Commit: `stage-1: circadian complete`.

-----

## Stage 2 — `flightUtils.ts`

**Tests covered:** `computeFlightDuration` (2), `convertToHomeTime` (2), `layoverPhaseWindows` (3). **Total: 7.**

```ts
import { DateTime } from 'luxon';
import { computeLightWindows } from './circadian';

export function computeFlightDuration(
  dep: string, originTZ: string, arr: string, destTZ: string
): number {
  const d = DateTime.fromISO(dep, { zone: originTZ });
  const a = DateTime.fromISO(arr, { zone: destTZ });
  return a.diff(d, 'minutes').minutes;
}

export function convertToHomeTime(
  localDT: string, fromTZ: string, toTZ: string
): { homeTime: string; homeDate: string } {
  const dt = DateTime.fromISO(localDT, { zone: fromTZ }).setZone(toTZ);
  return { homeTime: dt.toFormat('HH:mm'), homeDate: dt.toISODate()! };
}
```

`layoverPhaseWindows` has latitude — tests only check shape. Simplest pass: compute each layover’s midpoint in home time, check membership in seek/avoid windows from `computeLightWindows`, emit one matching action.

### Exit gate for Stage 2

Stages 1 + 2 all green (28 tests). Commit: `stage-2: flightUtils complete`.

-----

## Stage 3 — `mealScheduler.ts`

**Tests covered:** `generateMealSchedule` (5). **Total: 5.**

Rules from tests:

- 3 `meal` actions per day, anchored at wake, wake+5h, wake+10h.
- Per-day shift: east = −60min × dayIndex, west = +60min × dayIndex.
- `inFlight: true` → add a `fast` action at `destinationNightStart`.
- `postArrival: true` → ignore dayIndex, anchor to `destinationWakeTime`.

```ts
export function generateMealSchedule(
  wakeTime: string, direction: Direction, dayIndex: number,
  opts?: { inFlight?: boolean; destinationNightStart?: string;
           destinationNightEnd?: string; postArrival?: boolean;
           destinationWakeTime?: string }
): Action[] {
  const wake = opts?.postArrival
    ? toMinutes(opts.destinationWakeTime!)
    : toMinutes(wakeTime);
  const shift = opts?.postArrival ? 0
    : direction === 'east' ? -60 * dayIndex
    : direction === 'west' ?  60 * dayIndex : 0;
  const mealTimes = [wake, wake + 300, wake + 600].map(m => m + shift);
  const actions: Action[] = mealTimes.map(m => ({
    type: 'meal', label: 'Meal', priority: 'recommended',
    localTime: fromMinutes(m),
  }));
  if (opts?.inFlight && opts.destinationNightStart) {
    actions.push({ type: 'fast', label: 'Fast', priority: 'recommended',
                   localTime: opts.destinationNightStart });
  }
  return actions;
}
```

### Exit gate for Stage 3

Stages 1–3 green (33 tests). Commit: `stage-3: mealScheduler complete`.

-----

## Stage 4 — `actions.ts`

**Tests covered:** `assembleHourlyBlocks` (4). **Total: 4.**

Pure assembler. 24 `HourBlock`s, one per hour 0..23.

Rules:

- For each hour: check membership in seekLight, avoidLight, sleepWindow.
- Sleep suppresses avoid-light (test line 424: no block has both).
- Attach `mealActions` by matching `localTime` hour.
- Attach `melatonin-flag` at `melatoninHour` if provided.
- `caffeine-avoid` for all hours in `[sleepStart − 6h, sleepStart)`.

Hour-in-window helper handles midnight wrap:

```ts
function hourInWindow(hour: number, start: string, end: string): boolean {
  const s = toMinutes(start) / 60;
  const e = toMinutes(end) / 60;
  if (s < e) return hour >= s && hour < e;
  return hour >= s || hour < e;  // wraps midnight
}
```

### Exit gate for Stage 4

Stages 1–4 green (37 tests). Commit: `stage-4: actions complete`.

-----

## Stage 5 — `planner.ts` (orchestrator)

**Tests covered:** `generatePlan` (7). **Total: 7.**

**Only module allowed to import from multiple stage-1-to-4 modules.**

Structure constraints (from tests):

- Exactly 7 days.
- Day 0 is 0–2 days before departure (test line 172).
- Phases present: `pre-travel`, `travel`, `post-arrival` (test line 188).
- **Split: 2 pre-travel + 1 travel + 4 post-arrival.** Do not deviate.

```ts
export function generatePlan(input: UserInput): JetLagPlan {
  const direction = detectTravelDirection(input.originTZ, input.destinationTZ);
  const tzShiftHours = /* compute from Luxon offsets, signed, in hours */;
  const cbtBaseline = computeCBTMinimum(
    input.habitualSleepStart, input.habitualWakeTime, input.chronotype
  );

  const days: DayPlan[] = [];
  let cbtCurrent = cbtBaseline;
  const departure = DateTime.fromISO(input.departureDateTime, { zone: input.originTZ });

  for (let i = 0; i < 7; i++) {
    const dayDate = departure.minus({ days: 2 - i });  // i=0 → dep-2
    const phase: Phase = i < 2 ? 'pre-travel'
                      : i === 2 ? 'travel'
                      : 'post-arrival';
    const lightWindows = computeLightWindows(cbtCurrent, direction);
    const mealActions = generateMealSchedule(
      input.habitualWakeTime, direction, i,
      phase === 'post-arrival'
        ? { postArrival: true, destinationWakeTime: input.habitualWakeTime }
        : undefined
    );
    const hourlyBlocks = assembleHourlyBlocks({
      date: dayDate.toISODate()!, phase, cbtMin: cbtCurrent, direction,
      lightWindows,
      sleepWindow: { start: input.habitualSleepStart, end: input.habitualWakeTime },
      mealActions,
    });
    days.push({
      dayIndex: i, date: dayDate.toISODate()!, phase,
      cbtMinEstimate: cbtCurrent, hourlyBlocks, daySummary: '',
    });
    cbtCurrent = advanceCBTMinimum(cbtCurrent, direction, true);
  }

  return {
    metadata: { tzShiftHours, direction, chronotype: input.chronotype,
                cbtMinBaseline: cbtBaseline, generatedAt: new Date().toISOString() },
    days,
  };
}
```

Gotcha — minimal direction: test line 215 expects zero `critical`-priority actions when direction is `minimal`. Ensure `computeLightWindows` returning null propagates through — `assembleHourlyBlocks` must not emit critical light actions when the windows are null.

### Exit gate for Stage 5

Stages 1–5 green (44 tests). **Milestone: algorithm complete, headless.** Commit: `stage-5: planner complete`.

-----

## Stage 6 — `validation.ts`

**Tests covered:** `validateUserInput` (7). **Total: 7.**

Pure gate returning `{ valid: boolean; errors: string[] }`. Error codes must match exactly:

- `departure-after-arrival`
- `same-timezone`
- `invalid-origin-tz` (use Luxon `DateTime.local().setZone(tz).isValid`)
- `invalid-sleep-window` (wake === sleep)
- `layover-outside-flight-window`

Missing `layovers` must not fail (test line 535).

### Exit gate for Stage 6

Stages 1–6 green (51 tests). Commit: `stage-6: validation complete`.

-----

## Stage 7 — `storage.ts`

**Tests covered:** `PlanStorage` (5). **Total: 5.**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['fake-indexeddb/auto'] },
});
```

Implementation (use `idb`):

```ts
import { openDB } from 'idb';
const DB = 'jetshift', STORE = 'plans';
const getDB = () => openDB(DB, 1, {
  upgrade(db) { db.createObjectStore(STORE, { keyPath: 'id' }); }
});
export const savePlan = async (p: any) => { await (await getDB()).put(STORE, p); };
export const getPlan = async (id: string) =>
  (await (await getDB()).get(STORE, id)) ?? null;
export const listPlans = async () => (await getDB()).getAll(STORE);
export const deletePlan = async (id: string) => (await getDB()).delete(STORE, id);
export const clearPlanStorage = async () => (await getDB()).clear(STORE);
```

### Exit gate for Stage 7

Stages 1–7 green (56 tests). **Milestone: full logic layer done.** Commit: `stage-7: storage complete`.

-----

## Stage 8 — UI shell (no new suite tests)

Build React screens against tested logic. **Do not modify any module from Stages 1–7.** If UI needs something the logic doesn’t expose, add a new exported function + write its test first (TDD for new code), then use it.

Screens:

- `<InputForm>` → `validateUserInput` → `generatePlan` → `savePlan`. Nav to plan view.
- `<PlanView>` → `getPlan(id)`, renders 7 day tabs + 24-hour strip. Tap hour block → detail modal.
- `<AboutModal>` → static copy + disclaimer.

### Exit gate for Stage 8

Manual QA: input LHR→SYD, see a 7-day plan render with expected phase labels. Commit: `stage-8: ui shell complete`.

-----

## Stage 9 — PWA shell & service worker

**Tests covered:** `Service Worker caching` (3). **Total: 3.**

`vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'JetShift', short_name: 'JetShift',
      display: 'standalone', theme_color: '#0a0a0a',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
  })],
});
```

Gotcha: test line 602 expects `x-from-cache: true`. Workbox doesn’t set that by default. Either add a custom Workbox `handlerDidRespond` plugin, **or** flag the test for rewrite (check `response.ok && response.type !== 'error'` after mocking offline). Do not rewrite tests silently.

### Exit gate for Stage 9

All 59 tests green. `npm run build` produces a PWA bundle. Install prompt works in Chrome. Commit: `stage-9: pwa complete`. **Ship.**

-----

## Anti-drift checklist (run before every commit)

- [ ] Am I in the right module? (file path matches current stage)
- [ ] Is there a failing test driving this change? (if no → stop, delete the code)
- [ ] Did I add code not required by the current test? (if yes → delete)
- [ ] Did I touch a module from a prior stage? (if yes → revert)
- [ ] Full suite still green for prior stages? (`npx vitest run`)
- [ ] `npx tsc --noEmit` passes?

If any box is unchecked: `git reset --hard HEAD` and retry the test.

## Known issues (flag, don’t silently fix)

1. **Sign convention in `advanceCBTMinimum`** — tests treat east as positive minute-delta; SPEC.md prose says the opposite. Match tests. File follow-up after Stage 5.
1. **Service worker test line 602** — `x-from-cache` header is non-standard. Decide at Stage 9.
1. **Spec typo** — `SPEC.md` line 108 has `habitual SleepStart` (stray space). Tests already use correct form. Fix spec after Stage 9.

**Total tests after v2 patch: 59.** If your count differs, stop and recount.
