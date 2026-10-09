import { MAX_SEATS, MIN_SEATS } from './logic';
import type { AppState, Charge, DealShare, Payment, Player, PrizePayment, Table, Tournament } from './types';

export const STORAGE_KEY = 'poker-tournament-manager:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function parseCharge(v: unknown): Charge | null {
  if (!isObject(v) || typeof v.id !== 'string') return null;
  if (v.kind !== 'buyin' && v.kind !== 'rebuy') return null;
  if (!isInt(v.amount) || v.amount < 0) return null;
  return { id: v.id, kind: v.kind, amount: v.amount };
}

function parsePayment(v: unknown): Payment | null {
  if (!isObject(v) || typeof v.id !== 'string') return null;
  if (v.method !== 'cash' && v.method !== 'interac' && v.method !== 'prize') return null;
  if (!isInt(v.amount) || v.amount <= 0) return null;
  return { id: v.id, amount: v.amount, method: v.method };
}

function parsePrizePayment(v: unknown): PrizePayment | null {
  if (!isObject(v) || typeof v.id !== 'string') return null;
  if (v.method !== 'cash' && v.method !== 'interac') return null;
  if (!isInt(v.amount) || v.amount <= 0) return null;
  return { id: v.id, amount: v.amount, method: v.method };
}

function parseDealShare(v: unknown): DealShare | null {
  if (!isObject(v) || typeof v.playerId !== 'string' || !isInt(v.amount) || v.amount < 0) return null;
  return { playerId: v.playerId, amount: v.amount };
}

function parseTable(v: unknown): Table | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isInt(v.number) || typeof v.open !== 'boolean') return null;
  return { id: v.id, number: v.number, open: v.open };
}

function parseList<T>(v: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parsePlayer(v: unknown): Player | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  let seat: Player['seat'] = null;
  if (v.seat !== null) {
    if (!isObject(v.seat) || typeof v.seat.tableId !== 'string' || !isInt(v.seat.seat)) return null;
    seat = { tableId: v.seat.tableId, seat: v.seat.seat };
  }
  const charges = parseList(v.charges, parseCharge);
  const payments = parseList(v.payments, parsePayment);
  if (!charges || !payments) return null;
  if (charges.filter((c) => c.kind === 'buyin').length !== 1) return null;
  // Optional: saves made before prize payments existed do not have it.
  const prizePaid = v.prizePaid === undefined ? undefined : parseList(v.prizePaid, parsePrizePayment);
  if (prizePaid === null) return null;
  return { id: v.id, name: v.name, seat, charges, payments, ...(prizePaid ? { prizePaid } : {}) };
}

export function parseTournament(v: unknown): Tournament | null {
  if (!isObject(v)) return null;
  if (typeof v.name !== 'string') return null;
  if (v.status !== 'setup' && v.status !== 'running' && v.status !== 'finished') return null;
  if (!isInt(v.buyInAmount) || v.buyInAmount <= 0) return null;
  if (!isInt(v.rebuyAmount) || v.rebuyAmount < 0) return null;
  if (typeof v.rebuysAllowed !== 'boolean' || typeof v.lateRegOpen !== 'boolean') return null;
  if (!isInt(v.seatsPerTable) || v.seatsPerTable < MIN_SEATS || v.seatsPerTable > MAX_SEATS) return null;
  if (!Array.isArray(v.payoutPercents) || !v.payoutPercents.every((p) => typeof p === 'number' && p > 0)) return null;
  if (!isInt(v.payoutRounding) || v.payoutRounding <= 0) return null;
  const tables = parseList(v.tables, parseTable);
  const players = parseList(v.players, parsePlayer);
  if (!tables || tables.length === 0 || !players) return null;
  if (!Array.isArray(v.eliminationOrder) || !v.eliminationOrder.every((id) => typeof id === 'string')) return null;

  const playerIds = new Set(players.map((p) => p.id));
  const tableIds = new Set(tables.map((tb) => tb.id));
  const eliminationOrder = v.eliminationOrder as string[];
  if (playerIds.size !== players.length || tableIds.size !== tables.length) return null;
  if (!eliminationOrder.every((id) => playerIds.has(id)) || new Set(eliminationOrder).size !== eliminationOrder.length) return null;
  const deal = v.deal === undefined ? undefined : parseList(v.deal, parseDealShare);
  if (deal === null || (deal && !deal.every((d) => playerIds.has(d.playerId)))) return null;
  const seatKeys = new Set<string>();
  for (const p of players) {
    if (!p.seat) continue;
    if (!tableIds.has(p.seat.tableId) || p.seat.seat < 1 || p.seat.seat > v.seatsPerTable) return null;
    const key = `${p.seat.tableId}:${p.seat.seat}`;
    if (seatKeys.has(key)) return null;
    seatKeys.add(key);
  }

  return {
    name: v.name,
    status: v.status,
    buyInAmount: v.buyInAmount,
    rebuyAmount: v.rebuyAmount,
    rebuysAllowed: v.rebuysAllowed,
    lateRegOpen: v.lateRegOpen,
    seatsPerTable: v.seatsPerTable,
    payoutPercents: v.payoutPercents as number[],
    payoutRounding: v.payoutRounding,
    tables,
    players,
    eliminationOrder,
    ...(deal ? { deal } : {}),
  };
}

/** Validates the shape of a saved or imported state. Returns null when it is not usable. */
export function parseAppState(v: unknown): AppState | null {
  if (!isObject(v)) return null;
  const tournament = parseTournament(v.tournament);
  const undoStack = parseList(v.undoStack ?? [], parseTournament);
  if (!tournament || !undoStack) return null;
  return { tournament, undoStack };
}

export function serializeState(state: AppState): string {
  return JSON.stringify({ version: 1, tournament: state.tournament, undoStack: state.undoStack });
}

/** Writes the state; if the browser's storage quota is hit, drops the oldest undo steps and retries. */
export function saveState(storage: StorageLike, state: AppState): AppState {
  let current = state;
  for (;;) {
    try {
      storage.setItem(STORAGE_KEY, serializeState(current));
      return current;
    } catch (err) {
      if (current.undoStack.length === 0) throw err;
      current = { ...current, undoStack: current.undoStack.slice(Math.ceil(current.undoStack.length / 2)) };
    }
  }
}

export function loadState(storage: StorageLike): AppState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseAppState(JSON.parse(raw));
  } catch {
    return null;
  }
}
