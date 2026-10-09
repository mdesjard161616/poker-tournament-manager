import { newId, randomInt, shuffle } from './rng';
import type { DealShare, Player, Seat, Table, Tournament } from './types';

export const MIN_TABLES = 1;
export const MAX_TABLES = 8;
export const MIN_SEATS = 2;
export const MAX_SEATS = 10;
export const ROUNDING_CHOICES = [1, 5, 10, 20];

// ---------- construction ----------

export function makeTable(number: number): Table {
  return { id: newId('t'), number, open: true };
}

export function makePlayer(name: string, buyInAmount: number, seat: Seat | null = null): Player {
  return {
    id: newId('p'),
    name,
    seat,
    charges: [{ id: newId('c'), kind: 'buyin', amount: buyInAmount }],
    payments: [],
  };
}

export function createTournament(today: string): Tournament {
  return {
    name: `Tournament ${today}`,
    status: 'setup',
    buyInAmount: 40,
    rebuyAmount: 40,
    rebuysAllowed: true,
    lateRegOpen: true,
    seatsPerTable: 9,
    payoutPercents: [],
    payoutRounding: 5,
    tables: [makeTable(1)],
    players: [],
    eliminationOrder: [],
  };
}

// ---------- players, tables, seats ----------

export function isActive(t: Tournament, playerId: string): boolean {
  return !t.eliminationOrder.includes(playerId);
}

export function activePlayers(t: Tournament): Player[] {
  const out = new Set(t.eliminationOrder);
  return t.players.filter((p) => !out.has(p.id));
}

export function unseatedPlayers(t: Tournament): Player[] {
  return activePlayers(t).filter((p) => p.seat === null);
}

export function openTables(t: Tournament): Table[] {
  return t.tables.filter((tb) => tb.open).sort((a, b) => a.number - b.number);
}

export function occupantOf(t: Tournament, tableId: string, seat: number): Player | null {
  return t.players.find((p) => p.seat?.tableId === tableId && p.seat.seat === seat) ?? null;
}

export function openSeatsAt(t: Tournament, tableId: string): number[] {
  const taken = new Set(t.players.filter((p) => p.seat?.tableId === tableId).map((p) => p.seat!.seat));
  const seats: number[] = [];
  for (let s = 1; s <= t.seatsPerTable; s++) if (!taken.has(s)) seats.push(s);
  return seats;
}

export interface TableCount {
  tableId: string;
  number: number;
  count: number;
}

export function tableCounts(t: Tournament): TableCount[] {
  return openTables(t).map((tb) => ({
    tableId: tb.id,
    number: tb.number,
    count: t.players.filter((p) => p.seat?.tableId === tb.id).length,
  }));
}

export function seatCapacity(t: Tournament): number {
  return openTables(t).length * t.seatsPerTable;
}

export function suggestedTableCount(players: number, seatsPerTable: number): number {
  return Math.min(MAX_TABLES, Math.max(MIN_TABLES, Math.ceil(players / seatsPerTable)));
}

export function nameError(t: Tournament, rawName: string, exceptPlayerId?: string): string | null {
  const name = rawName.trim();
  if (!name) return 'Enter a name.';
  const lower = name.toLowerCase();
  if (t.players.some((p) => p.id !== exceptPlayerId && p.name.toLowerCase() === lower)) {
    return `"${name}" is already registered: add a distinguishing initial.`;
  }
  return null;
}

export function startBlockers(t: Tournament): string[] {
  const blockers: string[] = [];
  const n = t.players.length;
  const seats = seatCapacity(t);
  if (n < 2) blockers.push('Register at least 2 players.');
  if (n > seats) blockers.push(`${n} players but only ${seats} seats: add a table or seats.`);
  const unseated = unseatedPlayers(t).length;
  if (unseated > 0) blockers.push(`${unseated} player${unseated === 1 ? ' has' : 's have'} no seat.`);
  return blockers;
}

// ---------- the draw ----------

function withSeats(t: Tournament, seats: Map<string, Seat | null>): Tournament {
  return { ...t, players: t.players.map((p) => (seats.has(p.id) ? { ...p, seat: seats.get(p.id)! } : p)) };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** Shuffle every active player, deal round-robin to the open tables, random seat within each table. */
export function randomizeAll(t: Tournament): Tournament {
  const tables = openTables(t);
  if (tables.length === 0) return t;
  const groups: Player[][] = tables.map(() => []);
  shuffle(activePlayers(t)).forEach((p, i) => groups[i % tables.length].push(p));
  const seats = new Map<string, Seat | null>();
  groups.forEach((group, i) => {
    const numbers = shuffle(range(1, t.seatsPerTable));
    group.forEach((p, j) => {
      // Players beyond the table's capacity stay unseated; Start is blocked in that case anyway.
      seats.set(p.id, j < numbers.length ? { tableId: tables[i].id, seat: numbers[j] } : null);
    });
  });
  return withSeats(t, seats);
}

function pickSeatAtSmallestTable(t: Tournament): Seat | null {
  const candidates = tableCounts(t)
    .map((tc) => ({ ...tc, open: openSeatsAt(t, tc.tableId) }))
    .filter((tc) => tc.open.length > 0);
  if (candidates.length === 0) return null;
  const min = Math.min(...candidates.map((c) => c.count));
  const smallest = candidates.filter((c) => c.count === min);
  const table = smallest[randomInt(smallest.length)];
  return { tableId: table.tableId, seat: table.open[randomInt(table.open.length)] };
}

/** Random open seat at the open table with the fewest players, or null when every seat is taken. */
export function suggestSeat(t: Tournament): Seat | null {
  return pickSeatAtSmallestTable(t);
}

/** Seat each unseated player at the table with the fewest players. Seated players do not move. */
export function randomizeUnseated(t: Tournament): Tournament {
  let next = t;
  for (const p of shuffle(unseatedPlayers(t))) {
    const seat = pickSeatAtSmallestTable(next);
    if (!seat) break;
    next = withSeats(next, new Map([[p.id, seat]]));
  }
  return next;
}

// ---------- money ----------

export function rebuyCount(p: Player): number {
  return p.charges.filter((c) => c.kind === 'rebuy').length;
}

export function playerTotal(p: Player): number {
  return p.charges.reduce((sum, c) => sum + c.amount, 0);
}

export function playerPaid(p: Player): number {
  return p.payments.reduce((sum, pay) => sum + pay.amount, 0);
}

export function playerOwes(p: Player): number {
  return playerTotal(p) - playerPaid(p);
}

export function paymentError(p: Player, amount: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Enter a whole dollar amount above 0.';
  const owes = playerOwes(p);
  if (amount > owes) return `Amount exceeds what ${p.name} owes ($${owes}).`;
  return null;
}

export function deleteChargeError(p: Player, chargeId: string): string | null {
  const charge = p.charges.find((c) => c.id === chargeId);
  if (!charge) return 'Charge not found.';
  if (charge.kind === 'buyin') return 'The buy-in cannot be deleted.';
  if (playerPaid(p) > playerTotal(p) - charge.amount) {
    return 'Remove a payment first: deleting this rebuy would leave more paid than charged.';
  }
  return null;
}

export function totalRebuys(t: Tournament): number {
  return t.players.reduce((sum, p) => sum + rebuyCount(p), 0);
}

/** Sum of all charges, paid or not. */
export function prizePool(t: Tournament): number {
  return t.players.reduce((sum, p) => sum + playerTotal(p), 0);
}

export function collected(t: Tournament): { total: number; cash: number; interac: number; prize: number } {
  const sums = { cash: 0, interac: 0, prize: 0 };
  for (const p of t.players) {
    for (const pay of p.payments) sums[pay.method] += pay.amount;
  }
  return { total: sums.cash + sums.interac + sums.prize, ...sums };
}

export function outstanding(t: Tournament): number {
  return prizePool(t) - collected(t).total;
}

// ---------- payouts ----------

export function defaultPayoutPercents(players: number): number[] {
  // Under 10 players is outside the spec's table; these two rows are this app's own choice.
  if (players <= 5) return [100];
  if (players <= 9) return [65, 35];
  if (players <= 15) return [50, 30, 20];
  if (players <= 30) return [45, 27, 18, 10];
  return [40, 25, 16, 11, 8];
}

export function effectivePayoutPercents(t: Tournament): number[] {
  return t.payoutPercents.length > 0 ? t.payoutPercents : defaultPayoutPercents(t.players.length);
}

export function payoutPercentsError(percents: number[]): string | null {
  if (percents.length === 0) return 'Pay at least one place.';
  if (percents.some((p) => !Number.isFinite(p) || p <= 0)) return 'Every place needs a percentage above 0.';
  const sum = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1e-6) return `Percentages sum to ${Math.round(sum * 100) / 100}, not 100.`;
  return null;
}

/** Places 2 and below are rounded to the nearest U; 1st takes the rest so the payouts sum to the pool. */
export function computePayouts(pool: number, percents: number[], rounding: number): number[] {
  if (percents.length === 0) return [];
  const rest = percents.slice(1).map((pct) => Math.round((pool * pct) / (100 * rounding)) * rounding);
  return [pool - rest.reduce((a, b) => a + b, 0), ...rest];
}

export function payoutsAreFinal(t: Tournament): boolean {
  return t.status === 'finished' || (t.status === 'running' && !t.rebuysAllowed && !t.lateRegOpen);
}

// ---------- finishing places ----------

/** Derived, never stored. Null while the player is still in. */
export function finishingPlace(t: Tournament, playerId: string): number | null {
  const index = t.eliminationOrder.indexOf(playerId);
  if (index >= 0) return t.players.length - (index + 1) + 1;
  // After a deal several players are still in, and none of them has a place.
  if (t.status === 'finished' && !t.deal) return 1;
  return null;
}

// ---------- settling prizes ----------

function placePayouts(t: Tournament): number[] {
  return computePayouts(prizePool(t), effectivePayoutPercents(t), t.payoutRounding);
}

/** Deal amount, or the prize for the finishing place; 0 while still in or outside the paid places. */
export function prizeFor(t: Tournament, playerId: string): number {
  const share = t.deal?.find((d) => d.playerId === playerId);
  if (share) return share.amount;
  const place = finishingPlace(t, playerId);
  if (place === null) return 0;
  return placePayouts(t)[place - 1] ?? 0;
}

/** What the players still in can share in a deal: the pool less the prizes already won by players who are out. */
export function dealPool(t: Tournament): number {
  const payouts = placePayouts(t);
  const won = t.eliminationOrder.reduce((sum, id) => sum + (payouts[finishingPlace(t, id)! - 1] ?? 0), 0);
  return prizePool(t) - won;
}

export function dealError(t: Tournament, shares: DealShare[]): string | null {
  const active = activePlayers(t);
  if (t.status !== 'running' || active.length < 2) return 'A deal needs at least 2 players still in.';
  const ids = new Set(shares.map((d) => d.playerId));
  if (ids.size !== shares.length || shares.length !== active.length || !active.every((p) => ids.has(p.id))) {
    return 'Enter an amount for every player still in.';
  }
  if (shares.some((d) => !Number.isInteger(d.amount) || d.amount < 0)) return 'Amounts must be whole dollars, 0 or more.';
  const total = shares.reduce((sum, d) => sum + d.amount, 0);
  const pool = dealPool(t);
  if (total !== pool) return `Amounts add up to ${money(total)}; there is ${money(pool)} to share.`;
  return null;
}

/** An even split of the deal pool; the first players get the odd dollars. */
export function evenDeal(t: Tournament): DealShare[] {
  const active = activePlayers(t);
  const pool = dealPool(t);
  const base = Math.floor(pool / active.length);
  const extra = pool - base * active.length;
  return active.map((p, i) => ({ playerId: p.id, amount: base + (i < extra ? 1 : 0) }));
}

export interface Settlement {
  prize: number;
  /** What the player owes right now, after any payments including ones settled from the prize. */
  owes: number;
  /** Already recorded as paid out of this player's prize. */
  settled: number;
  /** Prize money already handed over. */
  paidOut: number;
  /** What the host still has to hand over: the prize less what was settled, paid out and is still owed. */
  toPay: number;
  /** What the player still owes once the whole prize has been kept back. */
  stillOwes: number;
  /** Settled and paid amounts the current prize no longer covers, for example after the places changed. */
  overSettled: number;
}

export function settledFromPrize(p: Player): number {
  return p.payments.reduce((sum, pay) => sum + (pay.method === 'prize' ? pay.amount : 0), 0);
}

export function prizePaidOut(p: Player): number {
  return (p.prizePaid ?? []).reduce((sum, pay) => sum + pay.amount, 0);
}

export function settlement(t: Tournament, p: Player): Settlement {
  const prize = prizeFor(t, p.id);
  const owes = Math.max(0, playerOwes(p));
  const settled = settledFromPrize(p);
  const paidOut = prizePaidOut(p);
  const remaining = Math.max(0, prize - settled - paidOut);
  const deducted = Math.min(remaining, owes);
  return {
    prize,
    owes,
    settled,
    paidOut,
    toPay: remaining - deducted,
    stillOwes: owes - deducted,
    overSettled: Math.max(0, settled + paidOut - prize),
  };
}

/** What "Settle from prize" would record: the debt, capped at what is left of the prize. */
export function settleAmount(t: Tournament, p: Player): number {
  const s = settlement(t, p);
  return s.owes - s.stillOwes;
}

/** The part of Outstanding that will be kept back from prizes instead of being collected. */
export function owedFromPrizes(t: Tournament): number {
  return t.players.reduce((sum, p) => sum + settleAmount(t, p), 0);
}

export interface CashBox {
  cashIn: number;
  /** Prizes already paid in cash. */
  cashOut: number;
  /** What should be in the box right now. */
  inBox: number;
  /** Prizes not handed over yet, by any method. */
  leftToPay: number;
  interacOut: number;
}

export function cashBox(t: Tournament): CashBox {
  let cashOut = 0;
  let interacOut = 0;
  let leftToPay = 0;
  for (const p of t.players) {
    for (const pay of p.prizePaid ?? []) {
      if (pay.method === 'cash') cashOut += pay.amount;
      else interacOut += pay.amount;
    }
    leftToPay += settlement(t, p).toPay;
  }
  const cashIn = collected(t).cash;
  return { cashIn, cashOut, inBox: cashIn - cashOut, leftToPay, interacOut };
}

// ---------- table alerts ----------

export interface BalanceMove {
  number: number;
  count: number;
  amount: number;
}

export interface BalancePlan {
  senders: BalanceMove[];
  receivers: BalanceMove[];
  /** False when the side is a choice ("Table 1 or 2"); each amount is then the total for that side. */
  sendersExact: boolean;
  receiversExact: boolean;
  message: string;
}

function label(m: BalanceMove): string {
  return `Table ${m.number} (${m.count})`;
}

export function balancePlan(counts: TableCount[]): BalancePlan | null {
  if (counts.length < 2) return null;
  const values = counts.map((c) => c.count);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min < 2) return null;

  const n = values.reduce((a, b) => a + b, 0);
  const low = Math.floor(n / counts.length);
  const high = Math.ceil(n / counts.length);

  let senders = counts.filter((c) => c.count > high).map((c) => ({ number: c.number, count: c.count, amount: c.count - high }));
  let receivers = counts.filter((c) => c.count < low).map((c) => ({ number: c.number, count: c.count, amount: low - c.count }));
  const sendersExact = senders.length > 0;
  const receiversExact = receivers.length > 0;
  if (!sendersExact) {
    const total = receivers.reduce((a, r) => a + r.amount, 0);
    senders = counts.filter((c) => c.count === max).map((c) => ({ number: c.number, count: c.count, amount: total }));
  }
  if (!receiversExact) {
    const total = senders.reduce((a, s) => a + s.amount, 0);
    receivers = counts.filter((c) => c.count === min).map((c) => ({ number: c.number, count: c.count, amount: total }));
  }

  let message: string;
  if (!sendersExact) {
    message = `${receivers.map((r) => `${label(r)} receives ${r.amount}`).join('; ')} from ${senders.map(label).join(' or ')}`;
  } else if (!receiversExact) {
    message = `${senders.map((s) => `${label(s)} sends ${s.amount}`).join('; ')} to ${receivers.map(label).join(' or ')}`;
  } else if (senders.length === 1 && receivers.length === 1) {
    message = `${label(senders[0])} sends ${senders[0].amount} to ${label(receivers[0])}`;
  } else {
    message = [
      ...senders.map((s) => `${label(s)} sends ${s.amount}`),
      ...receivers.map((r) => `${label(r)} receives ${r.amount}`),
    ].join('; ');
  }
  return { senders, receivers, sendersExact, receiversExact, message };
}

export type TableAlert =
  | { kind: 'final'; players: number; message: string }
  | { kind: 'break'; players: number; suggested: TableCount; message: string }
  | { kind: 'balance'; plan: BalancePlan; message: string };

/** Fewest players; ties go to the highest table number. */
export function suggestedTableToBreak(counts: TableCount[]): TableCount | null {
  let best: TableCount | null = null;
  for (const c of counts) {
    if (!best || c.count < best.count || (c.count === best.count && c.number > best.number)) best = c;
  }
  return best;
}

/** At most one alert: the first rule that is true, in priority order. */
export function computeAlert(t: Tournament): TableAlert | null {
  if (t.status !== 'running') return null;
  const counts = tableCounts(t);
  const tables = counts.length;
  const n = activePlayers(t).length;
  const s = t.seatsPerTable;

  if (tables > 1 && n <= s) {
    return { kind: 'final', players: n, message: `${n} players left: combine to the final table` };
  }
  if (tables > 1 && n <= (tables - 1) * s) {
    const suggested = suggestedTableToBreak(counts)!;
    return {
      kind: 'break',
      players: n,
      suggested,
      message: `${n} players fit on ${tables - 1} table${tables - 1 === 1 ? '' : 's'}: break one`,
    };
  }
  const plan = balancePlan(counts);
  if (plan) return { kind: 'balance', plan, message: plan.message };
  return null;
}

// ---------- formatting ----------

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-CA')}`;
}
