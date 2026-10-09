import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  balancePlan,
  cashBox,
  dealError,
  dealPool,
  evenDeal,
  collected,
  computeAlert,
  computePayouts,
  finishingPlace,
  holdbackAmount,
  payoutPool,
  outstanding,
  owedFromPrizes,
  settlement,
  paymentError,
  playerOwes,
  playerPaid,
  playerTotal,
  prizePool,
  startBlockers,
  tableCounts,
  type TableCount,
} from './logic';
import { initialState, reduce, type Action } from './reducer';
import { seededRandomInt, setRandomInt } from './rng';
import { STORAGE_KEY, loadState, parseAppState, saveState, serializeState } from './storage';
import type { AppState, Tournament } from './types';

beforeEach(() => setRandomInt(seededRandomInt(42)));
afterEach(() => setRandomInt(null));

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reduce, state);
}

function names(n: number, prefix = 'Player'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
}

function setup(players: number, tables: number, seats = 9): AppState {
  return run(
    initialState('2026-10-09'),
    { type: 'setSeatsPerTable', seats },
    { type: 'addPlayers', names: names(players) },
    { type: 'setTableCount', count: tables },
  );
}

function drawn(players: number, tables: number, seats = 9): AppState {
  return run(setup(players, tables, seats), { type: 'randomizeAll' });
}

function started(players: number, tables: number, seats = 9): AppState {
  const state = run(drawn(players, tables, seats), { type: 'start' });
  expect(state.tournament.status).toBe('running');
  return state;
}

/** A running tournament seated by hand with exactly these table counts. */
function withCounts(counts: number[], seats = 9): AppState {
  let state = setup(counts.reduce((a, b) => a + b, 0), counts.length, seats);
  const tables = state.tournament.tables;
  let i = 0;
  counts.forEach((count, tableIndex) => {
    for (let seat = 1; seat <= count; seat++) {
      state = reduce(state, { type: 'seatPlayer', playerId: state.tournament.players[i++].id, tableId: tables[tableIndex].id, seat });
    }
  });
  state = reduce(state, { type: 'start' });
  expect(state.tournament.status).toBe('running');
  return state;
}

function counts(t: Tournament): number[] {
  return tableCounts(t).map((c) => c.count);
}

function plain(values: number[]): TableCount[] {
  return values.map((count, i) => ({ tableId: `t${i + 1}`, number: i + 1, count }));
}

function seatedAt(t: Tournament, tableNumber: number) {
  const table = t.tables.find((tb) => tb.number === tableNumber)!;
  return t.players.filter((p) => p.seat?.tableId === table.id);
}

describe('draw', () => {
  it('27 players on 3 tables of 9: 9 / 9 / 9 with no duplicate seats', () => {
    const t = drawn(27, 3).tournament;
    expect(counts(t)).toEqual([9, 9, 9]);
    const keys = t.players.map((p) => `${p.seat!.tableId}:${p.seat!.seat}`);
    expect(new Set(keys).size).toBe(27);
    expect(t.players.every((p) => p.seat!.seat >= 1 && p.seat!.seat <= 9)).toBe(true);
  });

  it('25 players on 3 tables: 9 / 8 / 8', () => {
    expect(counts(drawn(25, 3).tournament)).toEqual([9, 8, 8]);
  });

  it('50 players on 6 tables: 9 / 9 / 8 / 8 / 8 / 8', () => {
    expect(counts(drawn(50, 6).tournament)).toEqual([9, 9, 8, 8, 8, 8]);
  });

  it('randomize unseated fills the smallest tables and leaves seated players alone', () => {
    let state = setup(20, 3);
    const [first] = state.tournament.players;
    state = reduce(state, { type: 'seatPlayer', playerId: first.id, tableId: state.tournament.tables[0].id, seat: 4 });
    state = reduce(state, { type: 'randomizeUnseated' });
    expect(counts(state.tournament).sort()).toEqual([6, 7, 7]);
    expect(state.tournament.players[0].seat).toEqual({ tableId: state.tournament.tables[0].id, seat: 4 });
  });

  it('tapping an occupied seat swaps the two players', () => {
    let state = drawn(10, 2);
    const [a, b] = state.tournament.players;
    state = reduce(state, { type: 'seatPlayer', playerId: a.id, tableId: b.seat!.tableId, seat: b.seat!.seat });
    expect(state.tournament.players[0].seat).toEqual(b.seat);
    expect(state.tournament.players[1].seat).toEqual(a.seat);
  });
});

describe('start', () => {
  it('is blocked with 30 players on 27 seats', () => {
    const state = drawn(30, 3);
    expect(startBlockers(state.tournament).join(' ')).toContain('30 players but only 27 seats');
    expect(reduce(state, { type: 'start' }).tournament.status).toBe('setup');
  });

  it('is blocked while a player has no seat or fewer than 2 are registered', () => {
    expect(startBlockers(setup(12, 2).tournament)).toHaveLength(1);
    expect(startBlockers(setup(1, 1).tournament).length).toBeGreaterThan(0);
  });

  it('rejects duplicate names case-insensitively and trims', () => {
    const state = run(initialState('x'), { type: 'addPlayers', names: ['  Alex ', 'alex', 'ALEX', 'Sam', ''] });
    expect(state.tournament.players.map((p) => p.name)).toEqual(['Alex', 'Sam']);
  });

  it('picks the default payout structure from the field size', () => {
    expect(started(12, 2).tournament.payoutPercents).toEqual([50, 30, 20]);
    expect(started(20, 3).tournament.payoutPercents).toEqual([45, 27, 18, 10]);
    expect(started(40, 5).tournament.payoutPercents).toEqual([40, 25, 16, 11, 8]);
  });
});

describe('balance', () => {
  it('8 / 7 / 7: no alert', () => {
    expect(balancePlan(plain([8, 7, 7]))).toBeNull();
    expect(computeAlert(withCounts([8, 7, 7]).tournament)).toBeNull();
  });

  it('8 / 8 / 6: Table 3 receives 1 from Table 1 or 2', () => {
    const alert = computeAlert(withCounts([8, 8, 6]).tournament);
    expect(alert?.kind).toBe('balance');
    const plan = balancePlan(plain([8, 8, 6]))!;
    expect(plan.receivers).toEqual([{ number: 3, count: 6, amount: 1 }]);
    expect(plan.sendersExact).toBe(false);
    expect(plan.senders.map((s) => s.number)).toEqual([1, 2]);
    expect(plan.message).toBe('Table 3 (6) receives 1 from Table 1 (8) or Table 2 (8)');
  });

  it('9 / 9 / 6: Tables 1 and 2 each send 1, Table 3 receives 2', () => {
    const alert = computeAlert(withCounts([9, 9, 6]).tournament);
    expect(alert?.kind).toBe('balance');
    const plan = balancePlan(plain([9, 9, 6]))!;
    expect(plan.senders).toEqual([
      { number: 1, count: 9, amount: 1 },
      { number: 2, count: 9, amount: 1 },
    ]);
    expect(plan.receivers).toEqual([{ number: 3, count: 6, amount: 2 }]);
  });

  it('words a single move like the spec example', () => {
    expect(balancePlan(plain([7, 8, 7, 6, 7]))!.message).toBe('Table 2 (8) sends 1 to Table 4 (6)');
  });
});

describe('break and final table', () => {
  it('4 tables of 7, then 1 elimination: break alert suggesting the table with 6', () => {
    let state = started(28, 4);
    expect(counts(state.tournament)).toEqual([7, 7, 7, 7]);
    const victim = seatedAt(state.tournament, 2)[0];
    state = reduce(state, { type: 'eliminate', playerId: victim.id });
    const alert = computeAlert(state.tournament);
    expect(alert?.kind).toBe('break');
    if (alert?.kind === 'break') {
      expect(alert.suggested.number).toBe(2);
      expect(alert.suggested.count).toBe(6);
      expect(alert.message).toBe('27 players fit on 3 tables: break one');
    }
  });

  it('4 tables of 7 with no elimination: no break alert', () => {
    expect(computeAlert(started(28, 4).tournament)).toBeNull();
  });

  it('ties for the table to break go to the highest table number', () => {
    const alert = computeAlert(withCounts([6, 6, 6, 6]).tournament);
    expect(alert?.kind === 'break' && alert.suggested.number).toBe(4);
  });

  it('2 tables of 5, then 1 elimination: final table alert, not a break alert', () => {
    let state = started(10, 2);
    expect(counts(state.tournament)).toEqual([5, 5]);
    state = reduce(state, { type: 'eliminate', playerId: state.tournament.players[0].id });
    const alert = computeAlert(state.tournament);
    expect(alert?.kind).toBe('final');
    expect(alert?.message).toBe('9 players left: combine to the final table');
  });

  it('breaking a table sends its players to the tray; randomize unseated rebalances', () => {
    let state = started(28, 4);
    state = reduce(state, { type: 'eliminate', playerId: seatedAt(state.tournament, 4)[0].id });
    const table4 = state.tournament.tables.find((tb) => tb.number === 4)!;
    state = reduce(state, { type: 'breakTable', tableId: table4.id });
    expect(counts(state.tournament)).toEqual([7, 7, 7]);
    expect(state.tournament.players.filter((p) => !p.seat).length).toBe(7); // 6 in the tray + 1 eliminated
    state = reduce(state, { type: 'randomizeUnseated' });
    expect(counts(state.tournament)).toEqual([9, 9, 9]);
    expect(computeAlert(state.tournament)).toBeNull();
  });

  it('redraw final table seats everyone at one table', () => {
    let state = started(10, 2);
    state = reduce(state, { type: 'eliminate', playerId: state.tournament.players[0].id });
    state = reduce(state, { type: 'redrawFinalTable' });
    expect(counts(state.tournament)).toEqual([9]);
    expect(new Set(state.tournament.players.filter((p) => p.seat).map((p) => p.seat!.seat)).size).toBe(9);
    expect(computeAlert(state.tournament)).toBeNull();
  });
});

describe('places', () => {
  it('a late registrant after an elimination shifts the earlier places', () => {
    let state = started(20, 3);
    const first = state.tournament.players[0];
    const second = state.tournament.players[1];
    state = reduce(state, { type: 'eliminate', playerId: first.id });
    state = reduce(state, { type: 'addLatePlayer', name: 'Latecomer', seat: null });
    expect(state.tournament.players).toHaveLength(21);
    state = reduce(state, { type: 'eliminate', playerId: second.id });
    expect(finishingPlace(state.tournament, first.id)).toBe(21);
    expect(finishingPlace(state.tournament, second.id)).toBe(20);
  });

  it('finishes automatically and places the last player 1st', () => {
    let state = started(3, 1);
    const [a, b, c] = state.tournament.players;
    state = run(state, { type: 'eliminate', playerId: a.id }, { type: 'eliminate', playerId: b.id });
    expect(state.tournament.status).toBe('finished');
    expect(finishingPlace(state.tournament, c.id)).toBe(1);
    expect(finishingPlace(state.tournament, b.id)).toBe(2);
    expect(finishingPlace(state.tournament, a.id)).toBe(3);
    state = reduce(state, { type: 'reinstate', playerId: b.id });
    expect(state.tournament.status).toBe('running');
    expect(finishingPlace(state.tournament, c.id)).toBeNull();
  });
});

describe('money', () => {
  function oneWithTwoRebuys(): { state: AppState; id: string } {
    let state = run(setup(10, 2), { type: 'setBuyIn', amount: 40 }, { type: 'setRebuyAmount', amount: 20 }, { type: 'randomizeAll' }, { type: 'start' });
    const id = state.tournament.players[0].id;
    state = run(
      state,
      { type: 'rebuy', playerId: id, method: 'owes' },
      { type: 'rebuy', playerId: id, method: 'owes' },
      { type: 'addPayment', playerId: id, amount: 50, method: 'cash' },
    );
    return { state, id };
  }
  const player = (state: AppState, id: string) => state.tournament.players.find((p) => p.id === id)!;

  it('B = 40, R = 20, 2 rebuys, cash payment of 50: Total 80, Paid 50, Owes 30', () => {
    const { state, id } = oneWithTwoRebuys();
    expect(playerTotal(player(state, id))).toBe(80);
    expect(playerPaid(player(state, id))).toBe(50);
    expect(playerOwes(player(state, id))).toBe(30);
  });

  it('then R changed to 30 and 1 more rebuy: Total 110', () => {
    let { state, id } = oneWithTwoRebuys();
    state = run(state, { type: 'setRebuyAmount', amount: 30 }, { type: 'rebuy', playerId: id, method: 'owes' });
    expect(playerTotal(player(state, id))).toBe(110);
  });

  it('Total 110 with 50 cash, then 60 Interac: Owes 0 and Collected rises by 60 under Interac', () => {
    let { state, id } = oneWithTwoRebuys();
    state = run(state, { type: 'setRebuyAmount', amount: 30 }, { type: 'rebuy', playerId: id, method: 'owes' });
    const before = collected(state.tournament);
    state = reduce(state, { type: 'addPayment', playerId: id, amount: 60, method: 'interac' });
    expect(playerOwes(player(state, id))).toBe(0);
    const after = collected(state.tournament);
    expect(after.interac - before.interac).toBe(60);
    expect(after.cash).toBe(before.cash);
    expect(after.total - before.total).toBe(60);
  });

  it('owes 30, payment of 40 entered: rejected', () => {
    const { state, id } = oneWithTwoRebuys();
    expect(paymentError(player(state, id), 40)).toContain('exceeds');
    expect(reduce(state, { type: 'addPayment', playerId: id, amount: 40, method: 'cash' })).toBe(state);
  });

  it('accepts a payment after the tournament is finished', () => {
    let state = run(setup(2, 1), { type: 'setBuyIn', amount: 30 }, { type: 'randomizeAll' }, { type: 'start' });
    const [a, b] = state.tournament.players;
    state = run(state, { type: 'markPaid', playerId: a.id }, { type: 'eliminate', playerId: a.id });
    expect(state.tournament.status).toBe('finished');
    expect(playerOwes(player(state, b.id))).toBe(30);
    const before = outstanding(state.tournament);
    state = reduce(state, { type: 'addPayment', playerId: b.id, amount: 30, method: 'interac' });
    expect(playerOwes(player(state, b.id))).toBe(0);
    expect(before - outstanding(state.tournament)).toBe(30);
  });

  it('a paid rebuy records the charge and the payment; mark paid clears the rest in cash', () => {
    let state = started(10, 2);
    const id = state.tournament.players[0].id;
    state = reduce(state, { type: 'rebuy', playerId: id, method: 'interac' });
    expect(playerOwes(player(state, id))).toBe(40);
    expect(player(state, id).payments).toMatchObject([{ amount: 40, method: 'interac' }]);
    state = reduce(state, { type: 'markPaid', playerId: id });
    expect(playerOwes(player(state, id))).toBe(0);
    expect(player(state, id).payments[1]).toMatchObject({ amount: 40, method: 'cash' });
  });

  it('blocks deleting a rebuy that would leave Paid above Total; never deletes the buy-in', () => {
    let state = started(10, 2);
    const id = state.tournament.players[0].id;
    state = run(state, { type: 'rebuy', playerId: id, method: 'cash' }, { type: 'markPaid', playerId: id });
    const [buyin, rebuy] = player(state, id).charges;
    expect(reduce(state, { type: 'deleteCharge', playerId: id, chargeId: rebuy.id })).toBe(state);
    expect(reduce(state, { type: 'deleteCharge', playerId: id, chargeId: buyin.id })).toBe(state);
    state = reduce(state, { type: 'deletePayment', playerId: id, paymentId: player(state, id).payments[0].id });
    state = reduce(state, { type: 'deleteCharge', playerId: id, chargeId: rebuy.id });
    expect(playerTotal(player(state, id))).toBe(40);
  });

  it('rebuy is refused once rebuys are turned off', () => {
    let state = reduce(started(10, 2), { type: 'setRebuysAllowed', value: false });
    const id = state.tournament.players[0].id;
    expect(reduce(state, { type: 'rebuy', playerId: id, method: 'cash' })).toBe(state);
  });
});

describe('pool and payouts', () => {
  it('20 players at 40 and 12 rebuys at 20: pool 1,040', () => {
    let state = run(setup(20, 3), { type: 'setRebuyAmount', amount: 20 }, { type: 'randomizeAll' }, { type: 'start' });
    for (let i = 0; i < 12; i++) {
      state = reduce(state, { type: 'rebuy', playerId: state.tournament.players[i % 5].id, method: i % 2 ? 'cash' : 'owes' });
    }
    expect(prizePool(state.tournament)).toBe(1040);
  });

  it('pool 1,040 at 45 / 27 / 18 / 10 rounded to 5: 470 / 280 / 185 / 105', () => {
    const payouts = computePayouts(1040, [45, 27, 18, 10], 5);
    expect(payouts).toEqual([470, 280, 185, 105]);
    expect(payouts.reduce((a, b) => a + b, 0)).toBe(1040);
  });

  it('always sums to the pool', () => {
    for (const pool of [395, 400, 1040, 1777, 2000]) {
      for (const u of [1, 5, 10, 20]) {
        expect(computePayouts(pool, [40, 25, 16, 11, 8], u).reduce((a, b) => a + b, 0)).toBe(pool);
      }
    }
  });
});

describe('settling prizes', () => {
  it('takes what a prize winner still owes off the prize', () => {
    let state = run(setup(10, 2), { type: 'randomizeAll' }, { type: 'start' });
    const ids = state.tournament.players.map((p) => p.id);
    // Everyone pays except the eventual winner (owes 40) and runner-up (owes 40 + an unpaid rebuy of 40).
    for (const id of ids.slice(2)) state = reduce(state, { type: 'markPaid', playerId: id });
    state = reduce(state, { type: 'rebuy', playerId: ids[1], method: 'owes' });
    for (const id of ids.slice(1).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    const t = state.tournament;
    expect(t.status).toBe('finished');
    expect(prizePool(t)).toBe(440);
    const byId = (id: string) => t.players.find((p) => p.id === id)!;
    // 50 / 30 / 20 of 440 rounded to 5: 220 / 130 / 90
    expect(settlement(t, byId(ids[0]))).toEqual({ prize: 220, owes: 40, settled: 0, paidOut: 0, toPay: 180, stillOwes: 0, overSettled: 0 });
    expect(settlement(t, byId(ids[1]))).toEqual({ prize: 130, owes: 80, settled: 0, paidOut: 0, toPay: 50, stillOwes: 0, overSettled: 0 });
    expect(settlement(t, byId(ids[2]))).toEqual({ prize: 90, owes: 0, settled: 0, paidOut: 0, toPay: 90, stillOwes: 0, overSettled: 0 });
    expect(settlement(t, byId(ids[5]))).toEqual({ prize: 0, owes: 0, settled: 0, paidOut: 0, toPay: 0, stillOwes: 0, overSettled: 0 });
    expect(owedFromPrizes(t)).toBe(120);
    expect(outstanding(t)).toBe(120);

    // Settle from prize records it: the debt clears, the amount to hand over does not change.
    const settledState = run(state, { type: 'settleFromPrize', playerId: ids[0] }, { type: 'settleFromPrize', playerId: ids[1] });
    const st = settledState.tournament;
    const after = (id: string) => st.players.find((p) => p.id === id)!;
    expect(settlement(st, after(ids[0]))).toEqual({ prize: 220, owes: 0, settled: 40, paidOut: 0, toPay: 180, stillOwes: 0, overSettled: 0 });
    expect(settlement(st, after(ids[1]))).toEqual({ prize: 130, owes: 0, settled: 80, paidOut: 0, toPay: 50, stillOwes: 0, overSettled: 0 });
    expect(playerOwes(after(ids[0]))).toBe(0);
    expect(outstanding(st)).toBe(0);
    expect(owedFromPrizes(st)).toBe(0);
    expect(collected(st)).toMatchObject({ prize: 120, cash: 320, interac: 0, total: 440 });
    // Nothing left to settle, so a second press does nothing; Undo brings the debt back.
    expect(reduce(settledState, { type: 'settleFromPrize', playerId: ids[0] })).toBe(settledState);
    expect(reduce(settledState, { type: 'settleFromPrize', playerId: ids[5] })).toBe(settledState);
    const undone = run(settledState, { type: 'undo' }, { type: 'undo' });
    expect(outstanding(undone.tournament)).toBe(120);
  });

  it('a prize smaller than the debt pays nothing and leaves the rest owed', () => {
    let state = run(setup(10, 2), { type: 'randomizeAll' }, { type: 'start' }, { type: 'setPayoutPercents', percents: [90, 6, 4] });
    const ids = state.tournament.players.map((p) => p.id);
    for (let i = 0; i < 3; i++) state = reduce(state, { type: 'rebuy', playerId: ids[2], method: 'owes' });
    for (const id of ids.slice(1).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    const third = state.tournament.players.find((p) => p.id === ids[2])!;
    // Pool 520, 3rd gets 4% rounded to 5 = 20, and owes 160.
    expect(settlement(state.tournament, third)).toEqual({ prize: 20, owes: 160, settled: 0, paidOut: 0, toPay: 0, stillOwes: 140, overSettled: 0 });
    // Settling keeps back the whole prize and leaves the rest owed.
    state = reduce(state, { type: 'settleFromPrize', playerId: ids[2] });
    const after = state.tournament.players.find((p) => p.id === ids[2])!;
    expect(settlement(state.tournament, after)).toEqual({ prize: 20, owes: 140, settled: 20, paidOut: 0, toPay: 0, stillOwes: 140, overSettled: 0 });
  });
});

describe('paying prizes', () => {
  function finished(): { state: AppState; ids: string[] } {
    let state = run(setup(10, 2), { type: 'randomizeAll' }, { type: 'start' });
    const ids = state.tournament.players.map((p) => p.id);
    for (const id of ids.slice(1)) state = reduce(state, { type: 'markPaid', playerId: id });
    for (const id of ids.slice(1).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    return { state, ids };
  }
  const player = (state: AppState, id: string) => state.tournament.players.find((p) => p.id === id)!;

  it('tracks the cash box as prizes are handed over', () => {
    let { state, ids } = finished();
    // Pool 400: 200 / 120 / 80. Nine paid cash (360); the winner still owes 40.
    expect(cashBox(state.tournament)).toEqual({ cashIn: 360, cashOut: 0, inBox: 360, leftToPay: 360, interacOut: 0, setAside: 0 });
    state = reduce(state, { type: 'payPrize', playerId: ids[1], method: 'cash' });
    state = reduce(state, { type: 'payPrize', playerId: ids[2], method: 'interac' });
    expect(cashBox(state.tournament)).toEqual({ cashIn: 360, cashOut: 120, inBox: 240, leftToPay: 160, interacOut: 80, setAside: 0 });
    expect(settlement(state.tournament, player(state, ids[1]))).toMatchObject({ prize: 120, paidOut: 120, toPay: 0 });
    // Nothing left to pay: a second press does nothing.
    expect(reduce(state, { type: 'payPrize', playerId: ids[1], method: 'cash' })).toBe(state);
    expect(reduce(state, { type: 'payPrize', playerId: ids[5], method: 'cash' })).toBe(state);
  });

  it('paying a winner who owes hands over the net amount and settles the debt', () => {
    let { state, ids } = finished();
    state = reduce(state, { type: 'payPrize', playerId: ids[0], method: 'cash' });
    const winner = player(state, ids[0]);
    expect(winner.prizePaid).toMatchObject([{ amount: 160, method: 'cash' }]);
    expect(playerOwes(winner)).toBe(0);
    expect(settlement(state.tournament, winner)).toEqual({ prize: 200, owes: 0, settled: 40, paidOut: 160, toPay: 0, stillOwes: 0, overSettled: 0 });
    expect(outstanding(state.tournament)).toBe(0);
    // Deleting the prize payment puts the amount back on the list to pay.
    state = reduce(state, { type: 'deletePrizePayment', playerId: ids[0], paymentId: winner.prizePaid![0].id });
    expect(settlement(state.tournament, player(state, ids[0])).toPay).toBe(160);
  });
});

describe('final-table deal', () => {
  function threeLeft(): { state: AppState; ids: string[] } {
    let state = run(setup(20, 3), { type: 'randomizeAll' }, { type: 'start' });
    const ids = state.tournament.players.map((p) => p.id);
    for (const id of ids.slice(3).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    return { state, ids };
  }

  it('shares what the players who are out have not already won', () => {
    const { state, ids } = threeLeft();
    const t = state.tournament;
    // Pool 800 at 45 / 27 / 18 / 10: 4th place already won 80.
    expect(dealPool(t)).toBe(720);
    expect(evenDeal(t).map((d) => d.amount)).toEqual([240, 240, 240]);
    const shares = [300, 220, 200].map((amount, i) => ({ playerId: ids[i], amount }));
    expect(dealError(t, shares)).toBeNull();
    expect(dealError(t, [{ ...shares[0], amount: 310 }, shares[1], shares[2]])).toContain('$730');
    expect(dealError(t, shares.slice(0, 2))).toContain('every player');
  });

  it('ends the tournament with the agreed amounts as prizes', () => {
    const { state: before, ids } = threeLeft();
    const shares = [300, 220, 200].map((amount, i) => ({ playerId: ids[i], amount }));
    let state = reduce(before, { type: 'setDeal', shares });
    const t = state.tournament;
    expect(t.status).toBe('finished');
    const byId = (id: string) => t.players.find((p) => p.id === id)!;
    expect(ids.slice(0, 3).map((id) => settlement(t, byId(id)).prize)).toEqual([300, 220, 200]);
    expect(finishingPlace(t, ids[0])).toBeNull();
    expect(settlement(t, byId(ids[3])).prize).toBe(80);
    expect(finishingPlace(t, ids[3])).toBe(4);
    expect(t.players.reduce((sum, p) => sum + settlement(t, p).prize, 0)).toBe(prizePool(t));
    // No reinstating under a deal; cancelling it resumes play.
    expect(reduce(state, { type: 'reinstate', playerId: ids[5] })).toBe(state);
    state = reduce(state, { type: 'cancelDeal' });
    expect(state.tournament.status).toBe('running');
    expect(state.tournament.deal).toBeUndefined();
    expect(run(state, { type: 'undo' }, { type: 'undo' }).tournament).toEqual(before.tournament);
  });

  it('survives a reload', () => {
    const { state: before, ids } = threeLeft();
    let state = reduce(before, { type: 'setDeal', shares: evenDeal(before.tournament) });
    state = reduce(state, { type: 'payPrize', playerId: ids[0], method: 'interac' });
    const restored = parseAppState(JSON.parse(serializeState(state)))!;
    expect(restored.tournament).toEqual(state.tournament);
    expect(restored.tournament.deal).toHaveLength(3);
    expect(restored.tournament.players[0].prizePaid).toHaveLength(1);
  });
});

describe('charity night', () => {
  // Buy-in 100, rebuy 20, half the pool set aside.
  function charity(): { state: AppState; ids: string[] } {
    const state = run(
      setup(10, 2),
      { type: 'setBuyIn', amount: 100 },
      { type: 'setRebuyAmount', amount: 20 },
      { type: 'setHoldback', percent: 50, label: 'the family' },
      { type: 'randomizeAll' },
      { type: 'start' },
    );
    return { state, ids: state.tournament.players.map((p) => p.id) };
  }
  const player = (state: AppState, id: string) => state.tournament.players.find((p) => p.id === id)!;

  it('up to 5 rebuys at once: one charge each, one payment for the lot', () => {
    let { state, ids } = charity();
    state = reduce(state, { type: 'rebuy', playerId: ids[0], method: 'cash', count: 5 });
    expect(player(state, ids[0]).charges.filter((c) => c.kind === 'rebuy')).toHaveLength(5);
    expect(player(state, ids[0]).payments).toMatchObject([{ amount: 100, method: 'cash' }]);
    expect(playerTotal(player(state, ids[0]))).toBe(200);
    expect(playerOwes(player(state, ids[0]))).toBe(100);
    state = reduce(state, { type: 'rebuy', playerId: ids[1], method: 'owes', count: 3 });
    expect(playerOwes(player(state, ids[1]))).toBe(160);
    expect(reduce(state, { type: 'rebuy', playerId: ids[1], method: 'cash', count: 6 })).toBe(state);
    expect(reduce(state, { type: 'rebuy', playerId: ids[1], method: 'cash', count: 0 })).toBe(state);
    // One Undo takes back the whole batch.
    expect(player(reduce(state, { type: 'undo' }), ids[1]).charges).toHaveLength(1);
  });

  it('sets half the pool aside and pays prizes from the rest', () => {
    let { state, ids } = charity();
    state = reduce(state, { type: 'rebuy', playerId: ids[0], method: 'cash', count: 5 });
    state = reduce(state, { type: 'rebuy', playerId: ids[1], method: 'cash', count: 1 });
    for (const id of ids.slice(1).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    const t = state.tournament;
    expect(prizePool(t)).toBe(1120);
    expect(holdbackAmount(t)).toBe(560);
    expect(payoutPool(t)).toBe(560);
    // 50 / 30 / 20 of 560 rounded to 5: 280 / 170 / 110
    expect(ids.slice(0, 3).map((id) => settlement(t, player(state, id)).prize)).toEqual([280, 170, 110]);
    expect(cashBox(t).setAside).toBe(560);
    // Everyone still owes their full charges: the amount set aside does not reduce what is collected.
    expect(outstanding(t)).toBe(1120 - 120);
    expect(parseAppState(JSON.parse(serializeState(state)))!.tournament.holdback).toEqual({ percent: 50, label: 'the family' });
  });

  it('a deal shares only the prize part', () => {
    let { state, ids } = charity();
    for (const id of ids.slice(2).reverse()) state = reduce(state, { type: 'eliminate', playerId: id });
    // Pool 1,000, 500 set aside, 3rd place already won 100.
    expect(dealPool(state.tournament)).toBe(400);
  });

  it('turning it off restores the full pool', () => {
    let { state } = charity();
    state = reduce(state, { type: 'setHoldback', percent: 0, label: '' });
    expect(state.tournament.holdback).toBeUndefined();
    expect(payoutPool(state.tournament)).toBe(1000);
  });
});

describe('undo', () => {
  it('eliminate then undo: same seat, elimination order as before', () => {
    const before = started(20, 3);
    const victim = before.tournament.players[3];
    const after = reduce(before, { type: 'eliminate', playerId: victim.id });
    expect(after.tournament.players[3].seat).toBeNull();
    const undone = reduce(after, { type: 'undo' });
    expect(undone.tournament.players[3].seat).toEqual(victim.seat);
    expect(undone.tournament.eliminationOrder).toEqual(before.tournament.eliminationOrder);
    expect(undone.tournament).toEqual(before.tournament);
  });

  it('walks back every kind of action to the start of play and no further', () => {
    const start = started(12, 2);
    const [a, b] = start.tournament.players;
    let state = run(
      start,
      { type: 'rebuy', playerId: a.id, method: 'cash' },
      { type: 'markPaid', playerId: b.id },
      { type: 'seatPlayer', playerId: a.id, tableId: b.seat!.tableId, seat: b.seat!.seat },
      { type: 'addLatePlayer', name: 'Latecomer', seat: null },
      { type: 'eliminate', playerId: b.id },
    );
    expect(state.undoStack).toHaveLength(5);
    for (let i = 0; i < 5; i++) state = reduce(state, { type: 'undo' });
    expect(state.tournament).toEqual(start.tournament);
    expect(reduce(state, { type: 'undo' })).toBe(state);
  });

  it('keeps at most 200 states', () => {
    let state = started(10, 2);
    const id = state.tournament.players[0].id;
    for (let i = 0; i < 210; i++) state = reduce(state, { type: 'rebuy', playerId: id, method: 'owes' });
    expect(state.undoStack).toHaveLength(200);
  });
});

describe('persistence', () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it('reload mid-tournament restores an identical state, including the undo stack', () => {
    let state = started(20, 3);
    const [a, b] = state.tournament.players;
    state = run(state, { type: 'rebuy', playerId: a.id, method: 'interac' }, { type: 'eliminate', playerId: b.id });
    const storage = memoryStorage();
    saveState(storage, state);
    const restored = loadState(storage);
    expect(restored).toEqual(state);
    expect(restored!.undoStack).toHaveLength(2);
  });

  it('drops old undo steps instead of failing when storage is full', () => {
    let state = started(10, 2);
    const id = state.tournament.players[0].id;
    for (let i = 0; i < 8; i++) state = reduce(state, { type: 'rebuy', playerId: id, method: 'owes' });
    const storage = memoryStorage();
    const limit = serializeState({ ...state, undoStack: state.undoStack.slice(4) }).length;
    const tight = {
      ...storage,
      setItem: (k: string, v: string) => {
        if (v.length > limit) throw new Error('QuotaExceededError');
        storage.setItem(k, v);
      },
    };
    const saved = saveState(tight, state);
    expect(saved.undoStack).toHaveLength(4);
    expect(loadState(storage)!.tournament).toEqual(state.tournament);
  });

  it('import rejects a file with the wrong shape', () => {
    const good = JSON.parse(serializeState(started(10, 2)));
    expect(parseAppState(good)).not.toBeNull();
    expect(parseAppState({ ...good, tournament: { ...good.tournament, players: 'nope' } })).toBeNull();
    expect(parseAppState({ ...good, tournament: { ...good.tournament, status: 'paused' } })).toBeNull();
    expect(parseAppState({ hello: 'world' })).toBeNull();
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(storage)).toBeNull();
  });
});
