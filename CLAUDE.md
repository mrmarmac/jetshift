# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

JetShift is a client-side-only PWA that generates a personalised 7-day jet lag mitigation plan based on the Kronauer/Jewett/Forger circadian oscillator model. All computation runs in the browser; there is no backend.

## Commands

```bash
# Install
npm install

# Run tests (full suite)
npx vitest run

# Run a single test by name
npx vitest run --reporter=verbose -t "computeCBTMinimum"

# Type-check
npx tsc --noEmit

# Dev server
npm run dev

# Production build
npm run build
```

## Architecture

Modules are built in strict dependency order (Stages 1–9). **Never import from a later stage into an earlier one.**

| Module | Stage | Description |
|---|---|---|
| `src/lib/time.ts` | 0 | `toMinutes` / `fromMinutes` helpers; no deps |
| `src/types.ts` | 0 | All TypeScript interfaces (`UserInput`, `JetLagPlan`, `DayPlan`, `HourBlock`, `Action`, etc.) |
| `src/circadian.ts` | 1 | PRC model: `computeCBTMinimum`, `detectTravelDirection`, `computeLightWindows`, `advanceCBTMinimum` |
| `src/flightUtils.ts` | 2 | `computeFlightDuration`, `convertToHomeTime`, `layoverPhaseWindows` |
| `src/mealScheduler.ts` | 3 | `generateMealSchedule` — meal/fast actions per day |
| `src/actions.ts` | 4 | `assembleHourlyBlocks` — pure 24-block assembler |
| `src/planner.ts` | 5 | `generatePlan` — orchestrates stages 1–4 into a 7-day `JetLagPlan` |
| `src/validation.ts` | 6 | `validateUserInput` → `{ valid, errors[] }` |
| `src/storage.ts` | 7 | IndexedDB via `idb`: `savePlan`, `getPlan`, `listPlans`, `deletePlan`, `clearPlanStorage` |
| `src/ui/*` | 8 | React screens: `<InputForm>`, `<PlanView>`, `<AboutModal>` |
| `vite.config.ts` | 9 | Vite + `vite-plugin-pwa` (Workbox, manifest) |

### Plan structure

`generatePlan` always produces exactly 7 days: **2 pre-travel + 1 travel + 4 post-arrival**, starting 2 days before departure. Each day has 24 `HourBlock`s (one per hour 0–23).

### Timezone handling

Use **Luxon only**. Never import moment, dayjs, or date-fns. All timezone arithmetic uses `DateTime.fromISO(..., { zone })` and `.setZone()`. The `detectTravelDirection` function picks the shorter path across the dateline (wraps diffs > 720 min).

### CBT minimum formula

```
duration = ((wakeMins - sleepMins) + 1440) % 1440
offsetMins = duration <= 420 ? 120 : 180   // 7h boundary
chronoOffset: early → −60, late → +60, intermediate → 0
cbtMin = wakeMins − offsetMins + chronoOffset
```

## TDD rules (enforced by BUILD_PLAN.md.txt)

- **Red first**: run the failing test before writing any code.
- **One test, one commit**: message format `stage-N: <test name>`.
- **No code outside the current stage's module.**
- **All prior stages must stay green** before moving forward.
- If any invariant is violated: `git reset --hard HEAD` and retry.
- No `any`, no `.skip()`, no `.only()`, no `xit()` — ever.
- No logic in UI code (Stages 1–7 are pure TS + IndexedDB).

## Test configuration

```ts
// vitest.config.ts
{ test: { environment: 'jsdom', setupFiles: ['fake-indexeddb/auto'] } }
```

The test file is `src/__tests__/jetshift.test.ts`. It uses `declare function` stubs at the bottom that must be replaced with real imports from their respective modules as each stage is built.

## Known issues (do not silently fix)

1. **`advanceCBTMinimum` sign convention**: tests treat eastward as a positive minute-delta; `SPEC.md.txt` prose says the opposite. Match the tests. File a follow-up after Stage 5.
2. **Service worker `x-from-cache` header** (test line 602): non-standard header, requires a custom Workbox `handlerDidRespond` plugin or test rewrite. Decide at Stage 9 — do not silently change the test.
3. **`SPEC.md.txt` typo** line 108: `habitual SleepStart` (stray space). Tests already use correct form `habitualSleepStart`. Fix spec after Stage 9.
