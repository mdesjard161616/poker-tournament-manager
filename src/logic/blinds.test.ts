import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildRows,
  chipCoverage,
  chipRemovals,
  clockElapsedMs,
  clockPosition,
  defaultChipSet,
  defaultCloseLevel,
  estimateDuration,
  expectedChips,
  firstLevelIndex,
  fitSteps,
  fitToLength,
  formatBlinds,
  formatCountdown,
  formatDuration,
  ladderSmallBlind,
  makeupError,
  newClock,
  playLevels,
  raiseWarning,
  reduceClock,
  shouldCloseEntries,
  suggestStructure,
  type PlanInputs,
} from './blinds';
import { chipsInPlay } from './logic';
import { initialState, reduce, type Action } from './reducer';
import { seededRandomInt, setRandomInt } from './rng';
import { parseAppState, serializeState } from './storage';
import type { AppState, BlindLevel, BlindPlan } from './types';

beforeEach(() => setRandomInt(seededRandomInt(7)));
afterEach(() => setRandomInt(null));

// 20 players at 5,000 and 10 rebuys at 5,000.
const typical: PlanInputs = { expectedPlayers: 20, expectedRebuys: 10, startingChips: 5000, rebuyChips: 5000, levelMinutes: 20 };

const MIN = 60000;

function rowsFor(inputs: PlanInputs): BlindLevel[] {
  const s = suggestStructure(inputs);
  if ('error' in s) throw new Error(s.error);
  return s.rows;
}

function blinds(rows: BlindLevel[]): string[] {
  return playLevels(rows).map((r) => formatBlinds(r.smallBlind, r.bigBlind));
}

/** 1-based level numbers that are followed by a break. */
function breaksAfter(rows: BlindLevel[]): number[] {
  const out: number[] = [];
  let level = 0;
  for (const r of rows) {
    if (r.kind === 'level') level++;
    else out.push(level);
  }
  return out;
}

function plan(rows: BlindLevel[], extra: Partial<BlindPlan> = {}): BlindPlan {
  return { expectedPlayers: 20, expectedRebuys: 10, levelMinutes: 20, levels: rows, edited: false, ...extra };
}

describe('ladder', () => {
  it('matches the spec', () => {
    expect(Array.from({ length: 22 }, (_, i) => ladderSmallBlind(i))).toEqual([
      25, 50, 75, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000,
    ]);
  });

  it('first level: 25/50 for 5,000 and 50/100 for 10,000', () => {
    expect(ladderSmallBlind(firstLevelIndex(5000))).toBe(25);
    expect(ladderSmallBlind(firstLevelIndex(10000))).toBe(50);
  });
});

describe('suggested structure', () => {
  it('typical night: 16 levels to 4,000/8,000 and 3 more after', () => {
    expect(expectedChips(typical)).toBe(150000);
    const rows = rowsFor(typical);
    const levels = blinds(rows);
    expect(levels).toHaveLength(19);
    expect(levels[0]).toBe('25/50');
    expect(levels[15]).toBe('4,000/8,000');
    expect(levels.slice(16)).toEqual(['5,000/10,000', '6,000/12,000', '8,000/16,000']);
    expect(playLevels(rows).every((r) => r.minutes === 20)).toBe(true);
  });

  it('breaks every 2 hours, moved by a level to line up with removing a chip', () => {
    const rows = rowsFor(typical);
    // Natural spots are after levels 6, 12 and 18; the 25s go after 5 and the 100s after 11.
    expect(breaksAfter(rows)).toEqual([5, 11, 18]);
    expect(defaultCloseLevel(rows)).toBe(5);
  });

  it('every blind is a multiple of 25 and strictly increasing', () => {
    for (const inputs of [typical, { ...typical, desiredMinutes: 240 }, { ...typical, startingChips: 10000, rebuyChips: 2000, expectedRebuys: 30 }]) {
      const levels = playLevels(rowsFor(inputs));
      levels.forEach((lv, i) => {
        expect(lv.smallBlind % 25).toBe(0);
        expect(lv.bigBlind % 25).toBe(0);
        if (i > 0) expect(lv.bigBlind).toBeGreaterThan(levels[i - 1].bigBlind);
      });
    }
  });

  it('needs a starting stack', () => {
    expect(suggestStructure({ ...typical, startingChips: 0 })).toHaveProperty('error');
  });
});

describe('estimate', () => {
  it('typical night: likely 5 h 40, earliest 5 h 20, latest 6 h 50', () => {
    const e = estimateDuration(rowsFor(typical), expectedChips(typical))!;
    expect(formatDuration(e.likely.minutes)).toBe('5 h 40');
    expect(formatBlinds(e.likely.smallBlind, e.likely.bigBlind)).toBe('4,000/8,000');
    expect(formatDuration(e.earliest.minutes)).toBe('5 h 20');
    expect(formatBlinds(e.earliest.smallBlind, e.earliest.bigBlind)).toBe('3,000/6,000');
    expect(formatDuration(e.latest.minutes)).toBe('6 h 50');
    expect(formatBlinds(e.latest.smallBlind, e.latest.bigBlind)).toBe('8,000/16,000');
  });

  it('recalculates from the chips actually in play', () => {
    let state: AppState = initialState('x');
    const run = (...actions: Action[]) => (state = actions.reduce(reduce, state));
    run({ type: 'setStartingChips', chips: 5000 }, { type: 'addPlayers', names: Array.from({ length: 25 }, (_, i) => `P${i}`) });
    run({ type: 'setTableCount', count: 3 }, { type: 'randomizeAll' }, { type: 'start' });
    for (let i = 0; i < 15; i++) run({ type: 'rebuy', playerId: state.tournament.players[i].id, method: 'owes' });
    const chips = chipsInPlay(state.tournament)!;
    expect(chips).toBe(200000);
    const rows = rowsFor(typical);
    // 200,000 / 20 = 10,000: one level later than the 150,000 the structure was suggested for.
    expect(estimateDuration(rows, chips)!.likely.bigBlind).toBe(10000);
    expect(estimateDuration(rows, 150000)!.likely.bigBlind).toBe(8000);
  });

  it('runs past the table by doubling', () => {
    const e = estimateDuration(rowsFor(typical), 2_000_000)!;
    expect(e.likely.bigBlind).toBe(128000);
    expect(e.likely.levelNumber).toBe(22);
  });
});

describe('fitting a desired length', () => {
  it('4 hours: 15-minute levels, 15 levels, 3 h 55', () => {
    const fit = fitToLength(typical, 240);
    expect(fit).toMatchObject({ option: { levelMinutes: 15, levels: 15, totalMinutes: 235 } });
    const rows = rowsFor({ ...typical, desiredMinutes: 240 });
    const levels = blinds(rows);
    expect(levels).toHaveLength(18);
    expect(levels[0]).toBe('25/50');
    expect(levels[14]).toBe('4,000/8,000');
    // The step dropped is the one that leaves the gentlest raise: 400/800 goes straight to 600/1,200.
    expect(levels).not.toContain('500/1,000');
    expect(formatDuration(estimateDuration(rows, 150000)!.likely.minutes)).toBe('3 h 55');
  });

  it('1 hour is rejected with the shortest possible length', () => {
    const fit = fitToLength(typical, 60);
    expect(fit).toMatchObject({ shortest: 90, longest: 510 });
    expect('error' in fit && fit.error).toContain('1 h 30');
    expect(suggestStructure({ ...typical, desiredMinutes: 60 })).toHaveProperty('error');
    expect('error' in fitToLength(typical, 900) && (fitToLength(typical, 900) as { error: string }).error).toContain('8 h 30');
  });

  it('no fitted structure more than doubles the blinds, and first and last levels stay', () => {
    for (const option of fitSteps(typical)) {
      const rows = rowsFor({ ...typical, desiredMinutes: option.totalMinutes });
      const levels = playLevels(rows);
      expect(levels[0].bigBlind).toBe(50);
      expect(levels.some((lv) => lv.bigBlind === 8000)).toBe(true);
      levels.forEach((lv, i) => {
        if (i > 0) expect(lv.bigBlind / levels[i - 1].bigBlind).toBeLessThanOrEqual(2);
      });
    }
  });

  it('shorter and longer steps are distinct lengths in order', () => {
    const totals = fitSteps(typical).map((o) => o.totalMinutes);
    expect(totals[0]).toBe(90);
    expect(totals[totals.length - 1]).toBe(510);
    expect(totals).toEqual([...new Set(totals)].sort((a, b) => a - b));
  });
});

describe('chip set', () => {
  it('full ladder: 25s after 150/300, 100s after 800/1,600, 500s after 1,500/3,000', () => {
    const rows = rowsFor(typical);
    const levels = blinds(rows);
    const removals = chipRemovals(rows).map((r) => `${r.value}: ${levels[r.afterLevel - 1]}`);
    expect(removals).toEqual(['25: 150/300', '100: 800/1,600', '500: 1,500/3,000']);
  });

  it('with 75/150 edited out, the 25s are still needed until 150/300', () => {
    const rows = rowsFor(typical).filter((r) => !(r.kind === 'level' && r.smallBlind === 75));
    const removal = chipRemovals(rows).find((r) => r.value === 25)!;
    expect(blinds(rows)[removal.afterLevel - 1]).toBe('150/300');
  });

  it('the typical make-up covers 37 players exactly and runs short at 38', () => {
    const set = defaultChipSet();
    expect(chipCoverage(set, 37, 0).map((c) => c.short)).toEqual([0, 0, 0, 0, 0]);
    expect(chipCoverage(set, 37, 0).slice(0, 3).map((c) => c.owned - c.needed)).toEqual([4, 4, 2]);
    expect(chipCoverage(set, 38, 0).map((c) => c.short)).toEqual([4, 4, 2, 0, 0]);
    expect(chipCoverage(set, 20, 10).map((c) => c.needed)).toEqual([240, 240, 120, 60, 0]);
  });

  it('a make-up must add up to the stack', () => {
    const set = defaultChipSet();
    expect(makeupError(set, [8, 8, 4, 2, 0], 5000)).toBeNull();
    expect(makeupError(set, [8, 8, 4, 1, 0], 5000)).toContain('4,000');
  });
});

describe('clock', () => {
  const rows = rowsFor(typical);
  const start = 1_000_000;

  it('started 25 minutes ago: level 2 with 15:00 left', () => {
    const clock = reduceClock(newClock(), rows, { type: 'clockStart', now: start });
    const p = clockPosition(rows, clockElapsedMs(clock, start + 25 * MIN))!;
    expect(p.levelNumber).toBe(2);
    expect(formatBlinds(p.smallBlind, p.bigBlind)).toBe('50/100');
    expect(formatCountdown(p.msLeft)).toBe('15:00');
    expect(p.next).toEqual({ smallBlind: 75, bigBlind: 150 });
    // The first break follows level 5: 100 minutes in.
    expect(p.msToNextBreak).toBe(75 * MIN);
  });

  it('a pause is not counted', () => {
    let clock = reduceClock(newClock(), rows, { type: 'clockStart', now: start });
    clock = reduceClock(clock, rows, { type: 'clockPause', now: start + 5 * MIN });
    expect(clockElapsedMs(clock, start + 15 * MIN)).toBe(5 * MIN);
    clock = reduceClock(clock, rows, { type: 'clockStart', now: start + 15 * MIN });
    expect(clockElapsedMs(clock, start + 18 * MIN)).toBe(8 * MIN);
  });

  it('Next with 8:00 left starts the next level at its full length; Previous goes back one', () => {
    let clock = reduceClock(newClock(), rows, { type: 'clockStart', now: start });
    const now = start + 12 * MIN;
    clock = reduceClock(clock, rows, { type: 'clockNext', now });
    let p = clockPosition(rows, clockElapsedMs(clock, now))!;
    expect(p.levelNumber).toBe(2);
    expect(formatCountdown(p.msLeft)).toBe('20:00');
    clock = reduceClock(clock, rows, { type: 'clockPrevious', now });
    p = clockPosition(rows, clockElapsedMs(clock, now))!;
    expect(p.levelNumber).toBe(1);
    expect(formatCountdown(p.msLeft)).toBe('20:00');
  });

  it('+1 and -1 minute change the time left', () => {
    let clock = reduceClock(newClock(), rows, { type: 'clockStart', now: start });
    const now = start + 12 * MIN;
    clock = reduceClock(clock, rows, { type: 'clockAdjust', now, minutes: 1 });
    expect(formatCountdown(clockPosition(rows, clockElapsedMs(clock, now))!.msLeft)).toBe('9:00');
    clock = reduceClock(clock, rows, { type: 'clockAdjust', now, minutes: -1 });
    clock = reduceClock(clock, rows, { type: 'clockAdjust', now, minutes: -1 });
    expect(formatCountdown(clockPosition(rows, clockElapsedMs(clock, now))!.msLeft)).toBe('7:00');
  });

  it('a break has its own countdown and keeps the blinds of the level just played', () => {
    const p = clockPosition(rows, 103 * MIN)!; // levels 1 to 5 take 100 minutes
    expect(p.isBreak).toBe(true);
    expect(p.levelNumber).toBe(5);
    expect(formatBlinds(p.smallBlind, p.bigBlind)).toBe('150/300');
    expect(formatCountdown(p.msLeft)).toBe('7:00');
    expect(p.next).toEqual({ smallBlind: 200, bigBlind: 400 });
    expect(p.msToNextBreak).toBeNull();
  });

  it('past the last row: a new level with doubled blinds', () => {
    const total = rows.reduce((sum, r) => sum + r.minutes, 0);
    const p = clockPosition(rows, (total + 1) * MIN)!;
    expect(p.levelNumber).toBe(20);
    expect(formatBlinds(p.smallBlind, p.bigBlind)).toBe('16,000/32,000');
    expect(formatCountdown(p.msLeft)).toBe('19:00');
  });

  it('survives a reload to the second, and stays out of Undo', () => {
    let state: AppState = initialState('x');
    const run = (...actions: Action[]) => (state = actions.reduce(reduce, state));
    run({ type: 'addPlayers', names: ['A', 'B', 'C', 'D'] }, { type: 'randomizeAll' });
    run({ type: 'setBlindPlan', plan: plan(rows) }, { type: 'start' }, { type: 'clockStart', now: start });
    run({ type: 'eliminate', playerId: state.tournament.players[0].id });
    run({ type: 'clockNext', now: start + 3 * MIN });
    const before = clockPosition(rows, clockElapsedMs(state.clock, start + 7 * MIN + 13000))!;
    expect(before.levelNumber).toBe(2);
    expect(formatCountdown(before.msLeft)).toBe('15:47');

    const restored = parseAppState(JSON.parse(serializeState(state)))!;
    expect(restored).toEqual(state);
    expect(clockPosition(rows, clockElapsedMs(restored.clock, start + 7 * MIN + 13000))).toEqual(before);

    // Undo takes back the elimination and leaves the clock alone; clock actions add nothing to Undo.
    expect(state.undoStack).toHaveLength(1);
    run({ type: 'undo' });
    expect(state.tournament.eliminationOrder).toEqual([]);
    expect(state.clock).toEqual(restored.clock);
  });

  it('New tournament resets the clock and the blinds but keeps the chip set', () => {
    let state: AppState = initialState('x');
    const run = (...actions: Action[]) => (state = actions.reduce(reduce, state));
    run({ type: 'setChipCount', index: 0, count: 400 }, { type: 'setChipMakeup', stack: 'rebuy', index: 4, count: 1 });
    run({ type: 'setBlindPlan', plan: plan(rows) }, { type: 'clockStart', now: start });
    run({ type: 'newTournament', today: 'y' });
    expect(state.clock).toEqual(newClock());
    expect(state.tournament.blinds).toBeUndefined();
    expect(state.chipSet.chips[0].count).toBe(400);
    expect(state.chipSet.rebuyMakeup[4]).toBe(1);
  });

  it('a save from before the clock existed still loads', () => {
    const old = JSON.parse(serializeState(initialState('x')));
    delete old.clock;
    delete old.chipSet;
    const loaded = parseAppState(old)!;
    expect(loaded.clock).toEqual(newClock());
    expect(loaded.chipSet).toEqual(defaultChipSet());
  });
});

describe('closing entries', () => {
  const rows = rowsFor(typical);

  it('closes rebuys and late registration when the chosen level ends, once', () => {
    let state: AppState = initialState('x');
    const run = (...actions: Action[]) => (state = actions.reduce(reduce, state));
    run({ type: 'addPlayers', names: ['A', 'B', 'C', 'D'] }, { type: 'randomizeAll' });
    run({ type: 'setBlindPlan', plan: plan(rows, { closeEntriesAfterLevel: 5 }) }, { type: 'start' });
    const at = (minutes: number) => clockPosition(rows, minutes * MIN);
    expect(shouldCloseEntries(state.tournament.blinds!, at(99))).toBe(false);
    expect(shouldCloseEntries(state.tournament.blinds!, at(101))).toBe(true); // in the break after level 5
    run({ type: 'closeEntries' });
    expect(state.tournament.rebuysAllowed).toBe(false);
    expect(state.tournament.lateRegOpen).toBe(false);
    expect(state.undoStack).toHaveLength(0);
    // The host reopens them: the app does not close them a second time.
    run({ type: 'setRebuysAllowed', value: true });
    expect(shouldCloseEntries(state.tournament.blinds!, at(130))).toBe(false);
    // Choosing a closing level again re-arms it.
    run({ type: 'setCloseEntriesAfter', levelNumber: 7 });
    expect(shouldCloseEntries(state.tournament.blinds!, at(130))).toBe(false);
    expect(shouldCloseEntries(state.tournament.blinds!, at(155))).toBe(true);
  });
});

describe('editing the structure', () => {
  const rows = rowsFor(typical);

  function withPlan(): AppState {
    return reduce(initialState('x'), { type: 'setBlindPlan', plan: plan(rows) });
  }

  it('rejects blinds that are not multiples of 25 or a big blind not above the small', () => {
    const state = withPlan();
    expect(reduce(state, { type: 'editBlindRow', index: 0, row: { kind: 'level', smallBlind: 30, bigBlind: 60, minutes: 20 } })).toBe(state);
    expect(reduce(state, { type: 'editBlindRow', index: 0, row: { kind: 'level', smallBlind: 50, bigBlind: 50, minutes: 20 } })).toBe(state);
    const edited = reduce(state, { type: 'editBlindRow', index: 0, row: { kind: 'level', smallBlind: 50, bigBlind: 100, minutes: 25 } });
    expect(edited.tournament.blinds!.levels[0]).toEqual({ kind: 'level', smallBlind: 50, bigBlind: 100, minutes: 25 });
    expect(edited.tournament.blinds!.edited).toBe(true);
  });

  it('warns on a level that more than doubles or does not raise, without blocking it', () => {
    const custom: BlindLevel[] = [
      { kind: 'level', smallBlind: 25, bigBlind: 50, minutes: 20 },
      { kind: 'level', smallBlind: 100, bigBlind: 200, minutes: 20 },
      { kind: 'level', smallBlind: 100, bigBlind: 200, minutes: 20 },
    ];
    expect(raiseWarning(custom, 0)).toBeNull();
    expect(raiseWarning(custom, 1)).toContain('doubles');
    expect(raiseWarning(custom, 2)).toContain('not raise');
    expect(reduce(initialState('x'), { type: 'setBlindPlan', plan: plan(custom) }).tournament.blinds!.levels).toHaveLength(3);
  });

  it('adds a level, adds and moves a break, removes a row', () => {
    let state = withPlan();
    const count = state.tournament.blinds!.levels.length;
    state = reduce(state, { type: 'addBlindLevel' });
    expect(state.tournament.blinds!.levels[count]).toEqual({ kind: 'level', smallBlind: 10000, bigBlind: 20000, minutes: 20 });
    state = reduce(state, { type: 'addBreakAfter', levelNumber: 2 });
    expect(breaksAfter(state.tournament.blinds!.levels)).toEqual([2, 5, 11, 18]);
    state = reduce(state, { type: 'moveBlindRow', index: 2, by: 1 });
    expect(breaksAfter(state.tournament.blinds!.levels)).toEqual([3, 5, 11, 18]);
    state = reduce(state, { type: 'removeBlindRow', index: 3 });
    expect(breaksAfter(state.tournament.blinds!.levels)).toEqual([5, 11, 18]);
    expect(buildRows([0, 1], 20)).toHaveLength(5);
  });
});
