import type { BlindLevel, BlindPlan, ChipSet, ClockState } from './types';

export const LEVEL_LENGTHS = [10, 12, 15, 20, 25, 30];
export const DEFAULT_LEVEL_MINUTES = 20;
export const BREAK_MINUTES = 10;
export const BREAK_EVERY_MINUTES = 120;
export const EXTRA_LEVELS = 3;
export const TARGET_RAISE = 0.35;
export const MAX_RAISE = 2; // a level never more than doubles the blinds

// The tournament is expected to end when the big blind reaches chips in play / END_DIVISOR.
// These three are the only tuning values of the duration estimate.
export const END_DIVISOR = 20;
export const EARLY_DIVISOR = 30;
export const LATE_DIVISOR = 10;

export const CHIP_VALUES = [25, 100, 500, 1000, 5000];

// ---------- the ladder ----------

const LADDER_START = [25, 50, 75];
const LADDER_PATTERN = [100, 150, 200, 300, 400, 500, 600, 800];

/** Small blind of ladder step i (0-based); the big blind is always double. */
export function ladderSmallBlind(i: number): number {
  if (i < LADDER_START.length) return LADDER_START[i];
  const k = i - LADDER_START.length;
  return LADDER_PATTERN[k % LADDER_PATTERN.length] * 10 ** Math.floor(k / LADDER_PATTERN.length);
}

function ladderBigBlind(i: number): number {
  return 2 * ladderSmallBlind(i);
}

/** Highest step whose big blind is no more than a hundredth of the starting stack. */
export function firstLevelIndex(startingChips: number): number {
  let i = 0;
  while (ladderBigBlind(i + 1) <= startingChips / 100) i++;
  return i;
}

/** First step whose big blind is at least `target`. */
export function ladderIndexForBigBlind(target: number): number {
  let i = 0;
  while (ladderBigBlind(i) < target) i++;
  return i;
}

export interface PlanInputs {
  expectedPlayers: number;
  expectedRebuys: number;
  startingChips: number;
  rebuyChips: number;
  levelMinutes: number;
  desiredMinutes?: number;
}

export function expectedChips(inputs: PlanInputs): number {
  return inputs.expectedPlayers * inputs.startingChips + inputs.expectedRebuys * inputs.rebuyChips;
}

function ladderRange(inputs: PlanInputs): { first: number; last: number } {
  const first = firstLevelIndex(inputs.startingChips);
  return { first, last: Math.max(first, ladderIndexForBigBlind(expectedChips(inputs) / END_DIVISOR)) };
}

/** Fewest levels from `first` to `last` when no level may more than double the blinds. */
export function minLevels(first: number, last: number): number {
  let count = 1;
  let at = first;
  while (at < last) {
    let next = at + 1;
    while (next < last && ladderBigBlind(next + 1) <= MAX_RAISE * ladderBigBlind(at)) next++;
    at = next;
    count++;
  }
  return count;
}

/**
 * `n` ladder steps from `first` to `last`, both kept, with the raises as even as possible and
 * none above double. Null when that cannot be done.
 */
export function pickLadderSteps(first: number, last: number, n: number): number[] | null {
  const m = last - first + 1;
  if (n < 1 || n > m) return null;
  if (n === 1) return m === 1 ? [first] : null;
  const bb = (offset: number) => ladderBigBlind(first + offset);
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m).fill(Infinity));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m).fill(-1));
  cost[1][0] = 0;
  for (let j = 2; j <= n; j++) {
    for (let i = j - 1; i < m; i++) {
      for (let p = j - 2; p < i; p++) {
        if (cost[j - 1][p] === Infinity) continue;
        const raise = bb(i) / bb(p);
        if (raise > MAX_RAISE + 1e-9) continue;
        const c = cost[j - 1][p] + Math.log(raise) ** 2;
        if (c < cost[j][i] - 1e-12) {
          cost[j][i] = c;
          from[j][i] = p;
        }
      }
    }
  }
  if (cost[n][m - 1] === Infinity) return null;
  const steps: number[] = [];
  for (let j = n, i = m - 1; j >= 1; i = from[j][i], j--) steps.unshift(first + i);
  return steps;
}

/** Breaks taken before the end of `levels` levels of `minutes` each: one after every 2 hours of play. */
export function breakCount(levels: number, minutes: number): number {
  return Math.max(0, Math.ceil((levels * minutes) / BREAK_EVERY_MINUTES) - 1);
}

// ---------- rows ----------

function level(smallBlind: number, minutes: number): BlindLevel {
  return { kind: 'level', smallBlind, bigBlind: 2 * smallBlind, minutes };
}

export function playLevels(rows: BlindLevel[]): BlindLevel[] {
  return rows.filter((r) => r.kind === 'level');
}

/** Row `index`, continuing past the table by doubling the last level's blinds at its length. */
export function rowAt(rows: BlindLevel[], index: number): BlindLevel | null {
  if (index < rows.length) return rows[index];
  const levels = playLevels(rows);
  const last = levels[levels.length - 1];
  if (!last) return null;
  const factor = 2 ** (index - rows.length + 1);
  return { kind: 'level', smallBlind: last.smallBlind * factor, bigBlind: last.bigBlind * factor, minutes: last.minutes };
}

export function levelError(row: BlindLevel): string | null {
  if (!Number.isInteger(row.minutes) || row.minutes < 1 || row.minutes > 180) return 'Minutes must be between 1 and 180.';
  if (row.kind === 'break') return null;
  if (!Number.isInteger(row.smallBlind) || !Number.isInteger(row.bigBlind) || row.smallBlind <= 0) return 'Enter both blinds.';
  if (row.smallBlind % 25 !== 0 || row.bigBlind % 25 !== 0) return 'Blinds must be multiples of 25.';
  if (row.bigBlind <= row.smallBlind) return 'The big blind must be above the small blind.';
  return null;
}

/** A warning, not an error: a level that lowers the big blind or more than doubles it. */
export function raiseWarning(rows: BlindLevel[], index: number): string | null {
  const row = rows[index];
  if (!row || row.kind !== 'level') return null;
  const prev = playLevels(rows.slice(0, index)).pop();
  if (!prev) return null;
  if (row.bigBlind <= prev.bigBlind) return 'Does not raise the big blind.';
  if (row.bigBlind > MAX_RAISE * prev.bigBlind) return 'More than doubles the big blind.';
  return null;
}

// ---------- chips ----------

export function defaultChipSet(): ChipSet {
  return {
    chips: [
      { value: 25, count: 300 },
      { value: 100, count: 300 },
      { value: 500, count: 150 },
      { value: 1000, count: 150 },
      { value: 5000, count: 100 },
    ],
    startingMakeup: [8, 8, 4, 2, 0],
    rebuyMakeup: [8, 8, 4, 2, 0],
  };
}

export function makeupTotal(set: ChipSet, makeup: number[]): number {
  return set.chips.reduce((sum, chip, i) => sum + chip.value * (makeup[i] ?? 0), 0);
}

export function makeupError(set: ChipSet, makeup: number[], stack: number): string | null {
  const total = makeupTotal(set, makeup);
  return total === stack ? null : `Adds up to ${total.toLocaleString('en-CA')}, the stack is ${stack.toLocaleString('en-CA')}.`;
}

export interface ChipCoverage {
  value: number;
  owned: number;
  needed: number;
  short: number; // 0 when the set covers it
}

export function chipCoverage(set: ChipSet, players: number, rebuys: number): ChipCoverage[] {
  return set.chips.map((chip, i) => {
    const needed = players * (set.startingMakeup[i] ?? 0) + rebuys * (set.rebuyMakeup[i] ?? 0);
    return { value: chip.value, owned: chip.count, needed, short: Math.max(0, needed - chip.count) };
  });
}

export interface ChipRemoval {
  value: number;
  afterLevel: number; // 1-based level number after which the chip can leave the table
}

/**
 * A chip can go once no later level has a blind that needs it, that is a blind that is not a
 * multiple of the next chip up. Chips still needed at the last level, or never needed, are left out.
 */
export function chipRemovals(rows: BlindLevel[], chipValues: number[] = CHIP_VALUES): ChipRemoval[] {
  const levels = playLevels(rows);
  const removals: ChipRemoval[] = [];
  for (let c = 0; c + 1 < chipValues.length; c++) {
    const next = chipValues[c + 1];
    let lastNeeded = 0;
    levels.forEach((lv, i) => {
      if (lv.smallBlind % next !== 0 || lv.bigBlind % next !== 0) lastNeeded = i + 1;
    });
    if (lastNeeded >= 1 && lastNeeded < levels.length) removals.push({ value: chipValues[c], afterLevel: lastNeeded });
  }
  return removals;
}

// ---------- building a structure ----------

/** Levels for the chosen ladder steps plus spare ones, with a break after every 2 hours of play. */
export function buildRows(steps: number[], minutes: number, chipValues: number[] = CHIP_VALUES): BlindLevel[] {
  const last = steps[steps.length - 1];
  const levels = [...steps, ...Array.from({ length: EXTRA_LEVELS }, (_, i) => last + 1 + i)].map((s) => level(ladderSmallBlind(s), minutes));
  const removals = chipRemovals(levels, chipValues).map((r) => r.afterLevel);
  const breaksAfter = new Set<number>();
  for (let block = 1; ; block++) {
    let after = Math.ceil((block * BREAK_EVERY_MINUTES) / minutes);
    if (after >= levels.length) break;
    // Chips are exchanged during a pause when a removal falls within one level of the break.
    const removal = removals.find((r) => Math.abs(r - after) <= 1);
    if (removal !== undefined) after = removal;
    breaksAfter.add(after);
  }
  const rows: BlindLevel[] = [];
  levels.forEach((lv, i) => {
    rows.push(lv);
    if (breaksAfter.has(i + 1)) rows.push({ kind: 'break', smallBlind: 0, bigBlind: 0, minutes: BREAK_MINUTES });
  });
  return rows;
}

export interface FitOption {
  levelMinutes: number;
  levels: number; // to the expected last level
  totalMinutes: number;
  averageRaise: number;
}

/** Every level length and level count that plays this field with no raise above double. */
export function fitOptions(inputs: PlanInputs): FitOption[] {
  const { first, last } = ladderRange(inputs);
  const ratio = ladderBigBlind(last) / ladderBigBlind(first);
  const options: FitOption[] = [];
  for (const levelMinutes of LEVEL_LENGTHS) {
    for (let n = minLevels(first, last); n <= last - first + 1; n++) {
      if (!pickLadderSteps(first, last, n)) continue;
      options.push({
        levelMinutes,
        levels: n,
        totalMinutes: n * levelMinutes + breakCount(n, levelMinutes) * BREAK_MINUTES,
        averageRaise: n > 1 ? ratio ** (1 / (n - 1)) - 1 : 0,
      });
    }
  }
  return options;
}

function better(a: FitOption, b: FitOption): FitOption {
  return Math.abs(a.averageRaise - TARGET_RAISE) <= Math.abs(b.averageRaise - TARGET_RAISE) ? a : b;
}

/** One option per total length, shortest first; of two with the same length, the gentler raises win. */
export function fitSteps(inputs: PlanInputs): FitOption[] {
  const byTotal = new Map<number, FitOption>();
  for (const o of fitOptions(inputs)) byTotal.set(o.totalMinutes, byTotal.has(o.totalMinutes) ? better(byTotal.get(o.totalMinutes)!, o) : o);
  return [...byTotal.values()].sort((a, b) => a.totalMinutes - b.totalMinutes);
}

export type FitResult = { option: FitOption } | { error: string; shortest: number; longest: number };

/** The option whose length is closest to the desired one, or why none fits. */
export function fitToLength(inputs: PlanInputs, desiredMinutes: number): FitResult {
  const steps = fitSteps(inputs);
  const shortest = steps[0].totalMinutes;
  const longest = steps[steps.length - 1].totalMinutes;
  if (desiredMinutes < shortest - 10) {
    return {
      error: `The shortest this field can play is about ${formatDuration(shortest)} (10-minute levels, blinds doubling). To go faster, raise the starting blinds or lower the starting stack.`,
      shortest,
      longest,
    };
  }
  if (desiredMinutes > longest + 10) {
    return {
      error: `The longest is about ${formatDuration(longest)} (30-minute levels, every step). To go longer, raise the starting stack.`,
      shortest,
      longest,
    };
  }
  let best = steps[0];
  for (const o of steps) if (Math.abs(o.totalMinutes - desiredMinutes) < Math.abs(best.totalMinutes - desiredMinutes)) best = o;
  return { option: best };
}

export type Suggestion = { rows: BlindLevel[]; levelMinutes: number } | { error: string };

export function suggestStructure(inputs: PlanInputs, chipValues: number[] = CHIP_VALUES): Suggestion {
  if (inputs.startingChips <= 0) return { error: 'Enter the starting stack first.' };
  const { first, last } = ladderRange(inputs);
  let levelMinutes = inputs.levelMinutes;
  let steps = pickLadderSteps(first, last, last - first + 1)!;
  if (inputs.desiredMinutes !== undefined) {
    const fit = fitToLength(inputs, inputs.desiredMinutes);
    if ('error' in fit) return { error: fit.error };
    levelMinutes = fit.option.levelMinutes;
    steps = pickLadderSteps(first, last, fit.option.levels)!;
  }
  return { rows: buildRows(steps, levelMinutes, chipValues), levelMinutes };
}

/** Default closing level for rebuys and late registration: the level before the first break. */
export function defaultCloseLevel(rows: BlindLevel[]): number | undefined {
  const firstBreak = rows.findIndex((r) => r.kind === 'break');
  return firstBreak > 0 ? playLevels(rows.slice(0, firstBreak)).length : undefined;
}

// ---------- the estimate ----------

export interface EstimatePoint {
  minutes: number; // from the start to the end of that level, breaks included
  levelNumber: number;
  smallBlind: number;
  bigBlind: number;
}

export interface Estimate {
  likely: EstimatePoint;
  earliest: EstimatePoint;
  latest: EstimatePoint;
}

function endOfLevelWithBigBlind(rows: BlindLevel[], target: number): EstimatePoint | null {
  let minutes = 0;
  let levelNumber = 0;
  for (let i = 0; i < rows.length + 60; i++) {
    const row = rowAt(rows, i);
    if (!row) return null;
    minutes += row.minutes;
    if (row.kind !== 'level') continue;
    levelNumber++;
    if (row.bigBlind >= target) return { minutes, levelNumber, smallBlind: row.smallBlind, bigBlind: row.bigBlind };
  }
  return null;
}

export function estimateDuration(rows: BlindLevel[], chips: number): Estimate | null {
  const likely = endOfLevelWithBigBlind(rows, chips / END_DIVISOR);
  const earliest = endOfLevelWithBigBlind(rows, chips / EARLY_DIVISOR);
  const latest = endOfLevelWithBigBlind(rows, chips / LATE_DIVISOR);
  return likely && earliest && latest ? { likely, earliest, latest } : null;
}

export function planChips(plan: BlindPlan, startingChips: number, rebuyChips: number): number {
  return plan.expectedPlayers * startingChips + plan.expectedRebuys * rebuyChips;
}

// ---------- the clock ----------

export function newClock(): ClockState {
  return { startedAt: null, elapsedBeforeMs: 0, adjustMs: 0 };
}

export function clockRunning(clock: ClockState): boolean {
  return clock.startedAt !== null;
}

export function clockStarted(clock: ClockState): boolean {
  return clock.startedAt !== null || clock.elapsedBeforeMs !== 0 || clock.adjustMs !== 0;
}

/** Time on the clock: banked time, plus the current run, plus the manual adjustments. Derived, never stored. */
export function clockElapsedMs(clock: ClockState, now: number): number {
  return Math.max(0, clock.elapsedBeforeMs + (clock.startedAt === null ? 0 : now - clock.startedAt) + clock.adjustMs);
}

export interface ClockPosition {
  rowIndex: number;
  isBreak: boolean;
  /** Levels started so far; during a break, the level just played. */
  levelNumber: number;
  /** Blinds in force; during a break, those of the level just played. */
  smallBlind: number;
  bigBlind: number;
  msLeft: number;
  rowStartMs: number;
  next: { smallBlind: number; bigBlind: number } | null;
  msToNextBreak: number | null;
}

export function clockPosition(rows: BlindLevel[], elapsedMs: number): ClockPosition | null {
  if (playLevels(rows).length === 0) return null;
  let start = 0;
  let levelNumber = 0;
  let current = { smallBlind: 0, bigBlind: 0 };
  for (let i = 0; ; i++) {
    const row = rowAt(rows, i)!;
    const end = start + row.minutes * 60000;
    if (row.kind === 'level') {
      levelNumber++;
      current = { smallBlind: row.smallBlind, bigBlind: row.bigBlind };
    }
    if (elapsedMs < end) {
      let next: ClockPosition['next'] = null;
      for (let j = i + 1; next === null; j++) {
        const r = rowAt(rows, j)!;
        if (r.kind === 'level') next = { smallBlind: r.smallBlind, bigBlind: r.bigBlind };
      }
      let msToNextBreak: number | null = null;
      if (row.kind === 'level') {
        let at = end;
        for (let j = i + 1; j < rows.length; j++) {
          if (rows[j].kind === 'break') {
            msToNextBreak = at - elapsedMs;
            break;
          }
          at += rows[j].minutes * 60000;
        }
      }
      return { rowIndex: i, isBreak: row.kind === 'break', levelNumber, ...current, msLeft: end - elapsedMs, rowStartMs: start, next, msToNextBreak };
    }
    start = end;
  }
}

export type ClockAction =
  | { type: 'clockStart'; now: number }
  | { type: 'clockPause'; now: number }
  | { type: 'clockNext'; now: number }
  | { type: 'clockPrevious'; now: number }
  | { type: 'clockAdjust'; now: number; minutes: number } // +1 gives the level one more minute
  | { type: 'clockReset' };

export function reduceClock(clock: ClockState, rows: BlindLevel[], action: ClockAction): ClockState {
  switch (action.type) {
    case 'clockStart':
      return clock.startedAt === null ? { ...clock, startedAt: action.now } : clock;
    case 'clockPause':
      if (clock.startedAt === null) return clock;
      return { ...clock, startedAt: null, elapsedBeforeMs: clock.elapsedBeforeMs + (action.now - clock.startedAt) };
    case 'clockReset':
      return clockStarted(clock) ? newClock() : clock;
    case 'clockNext':
    case 'clockPrevious':
    case 'clockAdjust': {
      const elapsed = clockElapsedMs(clock, action.now);
      const position = clockPosition(rows, elapsed);
      if (!position) return clock;
      let target: number;
      if (action.type === 'clockNext') {
        target = elapsed + position.msLeft;
      } else if (action.type === 'clockPrevious') {
        const prev = position.rowIndex > 0 ? rowAt(rows, position.rowIndex - 1)! : null;
        target = prev ? position.rowStartMs - prev.minutes * 60000 : 0;
      } else {
        target = Math.max(0, elapsed - action.minutes * 60000);
      }
      return target === elapsed ? clock : { ...clock, adjustMs: clock.adjustMs + (target - elapsed) };
    }
  }
}

/** True once the closing level has ended and the entries have not been closed for it yet. */
export function shouldCloseEntries(plan: BlindPlan, position: ClockPosition | null): boolean {
  if (!position || plan.entriesClosed || plan.closeEntriesAfterLevel === undefined) return false;
  const closing = plan.closeEntriesAfterLevel;
  return position.levelNumber > closing || (position.levelNumber === closing && position.isBreak);
}

// ---------- formatting ----------

/** "5 h 40", "45 min" */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** "12:40", "1:02:40" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatBlinds(smallBlind: number, bigBlind: number): string {
  return `${smallBlind.toLocaleString('en-CA')}/${bigBlind.toLocaleString('en-CA')}`;
}
