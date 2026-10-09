import {
  MAX_SEATS,
  MAX_TABLES,
  MIN_SEATS,
  MIN_TABLES,
  ROUNDING_CHOICES,
  activePlayers,
  createTournament,
  defaultPayoutPercents,
  deleteChargeError,
  isActive,
  makePlayer,
  makeTable,
  nameError,
  occupantOf,
  openTables,
  paymentError,
  payoutPercentsError,
  playerOwes,
  playerPaid,
  randomizeAll,
  randomizeUnseated,
  settleAmount,
  settlement,
  dealError,
  startBlockers,
  suggestedTableCount,
} from './logic';
import { newId, shuffle } from './rng';
import type { AppState, DealShare, Player, Seat, Tournament } from './types';

export const UNDO_LIMIT = 200;

export type Action =
  | { type: 'setName'; name: string }
  | { type: 'setBuyIn'; amount: number }
  | { type: 'setRebuyAmount'; amount: number }
  | { type: 'setRebuysAllowed'; value: boolean }
  | { type: 'setLateRegOpen'; value: boolean }
  | { type: 'setTableCount'; count: number }
  | { type: 'setSeatsPerTable'; seats: number }
  | { type: 'setPayoutPercents'; percents: number[] }
  | { type: 'setPayoutRounding'; rounding: number }
  | { type: 'addPlayers'; names: string[] }
  | { type: 'addLatePlayer'; name: string; seat: Seat | null }
  | { type: 'renamePlayer'; playerId: string; name: string }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'seatPlayer'; playerId: string; tableId: string; seat: number }
  | { type: 'unseatPlayer'; playerId: string }
  | { type: 'clearSeats' }
  | { type: 'randomizeAll' }
  | { type: 'randomizeUnseated' }
  | { type: 'start' }
  | { type: 'rebuy'; playerId: string; method: 'cash' | 'interac' | 'owes' }
  | { type: 'markPaid'; playerId: string }
  | { type: 'settleFromPrize'; playerId: string }
  | { type: 'payPrize'; playerId: string; method: 'cash' | 'interac' }
  | { type: 'deletePrizePayment'; playerId: string; paymentId: string }
  | { type: 'setDeal'; shares: DealShare[] }
  | { type: 'cancelDeal' }
  | { type: 'addPayment'; playerId: string; amount: number; method: 'cash' | 'interac' }
  | { type: 'deletePayment'; playerId: string; paymentId: string }
  | { type: 'setPaymentMethod'; playerId: string; paymentId: string; method: 'cash' | 'interac' }
  | { type: 'deleteCharge'; playerId: string; chargeId: string }
  | { type: 'eliminate'; playerId: string }
  | { type: 'reinstate'; playerId: string }
  | { type: 'breakTable'; tableId: string }
  | { type: 'redrawFinalTable' }
  | { type: 'addTable' }
  | { type: 'undo' }
  | { type: 'import'; state: AppState }
  | { type: 'newTournament'; today: string };

export function initialState(today: string): AppState {
  return { tournament: createTournament(today), undoStack: [] };
}

function mapPlayer(t: Tournament, playerId: string, fn: (p: Player) => Player): Tournament {
  let changed = false;
  const players = t.players.map((p) => {
    if (p.id !== playerId) return p;
    const next = fn(p);
    if (next !== p) changed = true;
    return next;
  });
  return changed ? { ...t, players } : t;
}

function findPlayer(t: Tournament, playerId: string): Player | undefined {
  return t.players.find((p) => p.id === playerId);
}

/** Setup only: grow or shrink to `count` tables, unseating anyone at a removed table. */
function resizeTables(t: Tournament, count: number): Tournament {
  const sorted = t.tables.slice().sort((a, b) => a.number - b.number);
  if (count === sorted.length) return t;
  if (count > sorted.length) {
    const tables = sorted.slice();
    for (let n = sorted.length + 1; n <= count; n++) tables.push(makeTable(n));
    return { ...t, tables };
  }
  const kept = sorted.slice(0, count);
  const keptIds = new Set(kept.map((tb) => tb.id));
  return {
    ...t,
    tables: kept,
    players: t.players.map((p) => (p.seat && !keptIds.has(p.seat.tableId) ? { ...p, seat: null } : p)),
  };
}

/**
 * Setup only: the table count follows ceil(players / seats) for as long as the host has left it
 * at the suggested value. It never shrinks away a table that has players seated at it.
 */
function followSuggestedTables(prev: Tournament, next: Tournament): Tournament {
  if (prev.tables.length !== suggestedTableCount(prev.players.length, prev.seatsPerTable)) return next;
  const target = suggestedTableCount(next.players.length, next.seatsPerTable);
  if (target < next.tables.length) {
    const removed = next.tables.slice().sort((a, b) => a.number - b.number).slice(target);
    const removedIds = new Set(removed.map((tb) => tb.id));
    if (next.players.some((p) => p.seat && removedIds.has(p.seat.tableId))) return next;
  }
  return resizeTables(next, target);
}

function reduceTournament(t: Tournament, action: Action): Tournament {
  const setup = t.status === 'setup';
  const running = t.status === 'running';

  switch (action.type) {
    case 'setName':
      return action.name === t.name ? t : { ...t, name: action.name };

    case 'setBuyIn': {
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount <= 0 || amount === t.buyInAmount) return t;
      if (!setup) return { ...t, buyInAmount: amount }; // new charges only
      return {
        ...t,
        buyInAmount: amount,
        rebuyAmount: t.rebuyAmount === t.buyInAmount ? amount : t.rebuyAmount,
        players: t.players.map((p) =>
          playerPaid(p) <= amount
            ? { ...p, charges: p.charges.map((c) => (c.kind === 'buyin' ? { ...c, amount } : c)) }
            : p,
        ),
      };
    }

    case 'setRebuyAmount':
      if (!Number.isInteger(action.amount) || action.amount < 0 || action.amount === t.rebuyAmount) return t;
      return { ...t, rebuyAmount: action.amount };

    case 'setRebuysAllowed':
      return action.value === t.rebuysAllowed ? t : { ...t, rebuysAllowed: action.value };

    case 'setLateRegOpen':
      return action.value === t.lateRegOpen ? t : { ...t, lateRegOpen: action.value };

    case 'setTableCount':
      if (!setup || !Number.isInteger(action.count) || action.count < MIN_TABLES || action.count > MAX_TABLES) return t;
      return resizeTables(t, action.count);

    case 'setSeatsPerTable': {
      const seats = action.seats;
      if (!setup || !Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS || seats === t.seatsPerTable) return t;
      const next: Tournament = {
        ...t,
        seatsPerTable: seats,
        players: t.players.map((p) => (p.seat && p.seat.seat > seats ? { ...p, seat: null } : p)),
      };
      return followSuggestedTables(t, next);
    }

    case 'setPayoutPercents':
      if (action.percents.length === 0) {
        if (setup) return t.payoutPercents.length === 0 ? t : { ...t, payoutPercents: [] };
        return { ...t, payoutPercents: defaultPayoutPercents(t.players.length) };
      }
      if (payoutPercentsError(action.percents)) return t;
      return { ...t, payoutPercents: action.percents.slice() };

    case 'setPayoutRounding':
      if (!ROUNDING_CHOICES.includes(action.rounding) || action.rounding === t.payoutRounding) return t;
      return { ...t, payoutRounding: action.rounding };

    case 'addPlayers': {
      if (!setup) return t;
      let next = t;
      for (const raw of action.names) {
        if (nameError(next, raw)) continue;
        next = { ...next, players: [...next.players, makePlayer(raw.trim(), next.buyInAmount)] };
      }
      return next === t ? t : followSuggestedTables(t, next);
    }

    case 'addLatePlayer': {
      if (!running || !t.lateRegOpen || nameError(t, action.name)) return t;
      let seat = action.seat;
      if (seat) {
        const table = t.tables.find((tb) => tb.id === seat!.tableId);
        const valid = table?.open && seat.seat >= 1 && seat.seat <= t.seatsPerTable && !occupantOf(t, seat.tableId, seat.seat);
        if (!valid) seat = null;
      }
      return { ...t, players: [...t.players, makePlayer(action.name.trim(), t.buyInAmount, seat)] };
    }

    case 'renamePlayer': {
      if (nameError(t, action.name, action.playerId)) return t;
      const name = action.name.trim();
      return mapPlayer(t, action.playerId, (p) => (p.name === name ? p : { ...p, name }));
    }

    case 'removePlayer':
      if (!setup || !findPlayer(t, action.playerId)) return t;
      return followSuggestedTables(t, { ...t, players: t.players.filter((p) => p.id !== action.playerId) });

    case 'seatPlayer': {
      const player = findPlayer(t, action.playerId);
      const table = t.tables.find((tb) => tb.id === action.tableId);
      if (!player || !table?.open || t.status === 'finished' || !isActive(t, player.id)) return t;
      if (!Number.isInteger(action.seat) || action.seat < 1 || action.seat > t.seatsPerTable) return t;
      const occupant = occupantOf(t, action.tableId, action.seat);
      if (occupant?.id === player.id) return t;
      const target: Seat = { tableId: action.tableId, seat: action.seat };
      return {
        ...t,
        players: t.players.map((p) => {
          if (p.id === player.id) return { ...p, seat: target };
          if (occupant && p.id === occupant.id) return { ...p, seat: player.seat }; // swap
          return p;
        }),
      };
    }

    case 'unseatPlayer':
      if (t.status === 'finished') return t;
      return mapPlayer(t, action.playerId, (p) => (p.seat ? { ...p, seat: null } : p));

    case 'clearSeats':
      if (!setup || !t.players.some((p) => p.seat)) return t;
      return { ...t, players: t.players.map((p) => (p.seat ? { ...p, seat: null } : p)) };

    case 'randomizeAll':
      if (!setup || t.players.length === 0) return t;
      return randomizeAll(t);

    case 'randomizeUnseated':
      if (t.status === 'finished') return t;
      return randomizeUnseated(t);

    case 'start':
      if (!setup || startBlockers(t).length > 0) return t;
      return {
        ...t,
        status: 'running',
        payoutPercents: t.payoutPercents.length > 0 ? t.payoutPercents : defaultPayoutPercents(t.players.length),
      };

    case 'rebuy': {
      if (!running || !t.rebuysAllowed || !isActive(t, action.playerId)) return t;
      const amount = t.rebuyAmount;
      const method = action.method;
      return mapPlayer(t, action.playerId, (p) => ({
        ...p,
        charges: [...p.charges, { id: newId('c'), kind: 'rebuy', amount }],
        payments: method !== 'owes' && amount > 0 ? [...p.payments, { id: newId('y'), amount, method }] : p.payments,
      }));
    }

    case 'markPaid':
      return mapPlayer(t, action.playerId, (p) => {
        const owes = playerOwes(p);
        if (owes <= 0) return p;
        return { ...p, payments: [...p.payments, { id: newId('y'), amount: owes, method: 'cash' }] };
      });

    case 'settleFromPrize':
      return mapPlayer(t, action.playerId, (p) => {
        const amount = settleAmount(t, p);
        if (amount <= 0) return p;
        return { ...p, payments: [...p.payments, { id: newId('y'), amount, method: 'prize' }] };
      });

    case 'payPrize':
      // Handing over the prize settles the debt that was kept back from it.
      return mapPlayer(t, action.playerId, (p) => {
        const s = settlement(t, p);
        if (s.toPay <= 0) return p;
        const kept = settleAmount(t, p);
        return {
          ...p,
          payments: kept > 0 ? [...p.payments, { id: newId('y'), amount: kept, method: 'prize' }] : p.payments,
          prizePaid: [...(p.prizePaid ?? []), { id: newId('z'), amount: s.toPay, method: action.method }],
        };
      });

    case 'deletePrizePayment':
      return mapPlayer(t, action.playerId, (p) =>
        p.prizePaid?.some((pay) => pay.id === action.paymentId)
          ? { ...p, prizePaid: p.prizePaid.filter((pay) => pay.id !== action.paymentId) }
          : p,
      );

    case 'setDeal':
      if (dealError(t, action.shares)) return t;
      return { ...t, deal: action.shares.map((d) => ({ playerId: d.playerId, amount: d.amount })) };

    case 'cancelDeal': {
      if (!t.deal) return t;
      const { deal: _deal, ...rest } = t;
      return rest;
    }

    case 'addPayment':
      return mapPlayer(t, action.playerId, (p) => {
        if (paymentError(p, action.amount)) return p;
        return { ...p, payments: [...p.payments, { id: newId('y'), amount: action.amount, method: action.method }] };
      });

    case 'deletePayment':
      return mapPlayer(t, action.playerId, (p) =>
        p.payments.some((pay) => pay.id === action.paymentId)
          ? { ...p, payments: p.payments.filter((pay) => pay.id !== action.paymentId) }
          : p,
      );

    case 'setPaymentMethod':
      return mapPlayer(t, action.playerId, (p) =>
        p.payments.some((pay) => pay.id === action.paymentId && pay.method !== action.method && pay.method !== 'prize')
          ? { ...p, payments: p.payments.map((pay) => (pay.id === action.paymentId ? { ...pay, method: action.method } : pay)) }
          : p,
      );

    case 'deleteCharge':
      return mapPlayer(t, action.playerId, (p) =>
        deleteChargeError(p, action.chargeId) ? p : { ...p, charges: p.charges.filter((c) => c.id !== action.chargeId) },
      );

    case 'eliminate': {
      if (!running || !findPlayer(t, action.playerId) || !isActive(t, action.playerId)) return t;
      const next = mapPlayer(t, action.playerId, (p) => ({ ...p, seat: null }));
      return { ...next, eliminationOrder: [...t.eliminationOrder, action.playerId] };
    }

    case 'reinstate':
      if (setup || t.deal || !t.eliminationOrder.includes(action.playerId)) return t;
      return { ...t, eliminationOrder: t.eliminationOrder.filter((id) => id !== action.playerId) };

    case 'breakTable': {
      const table = t.tables.find((tb) => tb.id === action.tableId);
      if (!running || !table?.open || openTables(t).length < 2) return t;
      return {
        ...t,
        tables: t.tables.map((tb) => (tb.id === table.id ? { ...tb, open: false } : tb)),
        players: t.players.map((p) => (p.seat?.tableId === table.id ? { ...p, seat: null } : p)),
      };
    }

    case 'redrawFinalTable': {
      const open = openTables(t);
      const active = activePlayers(t);
      if (!running || open.length < 2 || active.length > t.seatsPerTable) return t;
      const final = open[0];
      const numbers = shuffle(Array.from({ length: t.seatsPerTable }, (_, i) => i + 1));
      const seatOf = new Map(active.map((p, i) => [p.id, numbers[i]]));
      return {
        ...t,
        tables: t.tables.map((tb) => (tb.id === final.id ? tb : tb.open ? { ...tb, open: false } : tb)),
        players: t.players.map((p) => (seatOf.has(p.id) ? { ...p, seat: { tableId: final.id, seat: seatOf.get(p.id)! } } : p)),
      };
    }

    case 'addTable': {
      if (!running || openTables(t).length >= MAX_TABLES) return t;
      const closed = t.tables.filter((tb) => !tb.open).sort((a, b) => a.number - b.number)[0];
      if (closed) return { ...t, tables: t.tables.map((tb) => (tb.id === closed.id ? { ...tb, open: true } : tb)) };
      const number = Math.max(0, ...t.tables.map((tb) => tb.number)) + 1;
      return { ...t, tables: [...t.tables, makeTable(number)] };
    }

    case 'undo':
    case 'import':
    case 'newTournament':
      return t; // handled in reduce()
  }
}

/** Finished as soon as one active player remains; running again if a reinstatement brings one back. */
function syncStatus(t: Tournament): Tournament {
  if (t.status === 'setup') return t;
  if (t.deal) return t.status === 'running' ? { ...t, status: 'finished' } : t;
  const active = activePlayers(t).length;
  if (t.status === 'running' && active <= 1) return { ...t, status: 'finished' };
  if (t.status === 'finished' && active > 1) return { ...t, status: 'running' };
  return t;
}

export function reduce(state: AppState, action: Action): AppState {
  if (action.type === 'undo') {
    if (state.undoStack.length === 0) return state;
    return {
      tournament: state.undoStack[state.undoStack.length - 1],
      undoStack: state.undoStack.slice(0, -1),
    };
  }
  if (action.type === 'import') return action.state;
  if (action.type === 'newTournament') return initialState(action.today);

  const prev = state.tournament;
  const next = reduceTournament(prev, action);
  if (next === prev) return state;
  // Undo goes back to the start of play, so setup edits are not recorded.
  const undoStack = prev.status === 'setup' ? [] : [...state.undoStack, prev].slice(-UNDO_LIMIT);
  return { tournament: syncStatus(next), undoStack };
}
