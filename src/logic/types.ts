export type Status = 'setup' | 'running' | 'finished';

// 'prize' is a debt kept back from the player's own prize: no money changes hands.
export type PaymentMethod = 'cash' | 'interac' | 'prize';

export interface Seat {
  tableId: string;
  seat: number;
}

export interface Tournament {
  name: string;
  status: Status;
  buyInAmount: number; // whole dollars
  rebuyAmount: number;
  rebuysAllowed: boolean;
  lateRegOpen: boolean;
  seatsPerTable: number; // S
  payoutPercents: number[]; // index 0 = 1st place, sums to 100; empty during setup = default for the field size
  payoutRounding: number; // U
  tables: Table[];
  players: Player[];
  eliminationOrder: string[]; // player ids, first out first
  /** Chips a buy-in gets; unset or 0 hides the average stack. */
  startingChips?: number;
  /** Chips one rebuy gets; unset means the same as a buy-in. */
  rebuyChips?: number;
  /** A share of the pool set aside before prizes, for example for a charity night. */
  holdback?: { percent: number; label: string };
  /** The blind structure and what it was suggested from. */
  blinds?: BlindPlan;
  /** Agreed dollar amounts by finishing place, index 0 = 1st, replacing the percentages for those places. Play continues. */
  placeAmounts?: number[];
  /** Agreed amounts for the players still in when they chopped. Setting it ends the tournament. */
  deal?: DealShare[];
}

export interface DealShare {
  playerId: string;
  amount: number; // whole dollars
}

export interface Table {
  id: string;
  number: number; // 1-based label
  open: boolean; // false once broken
}

export interface Player {
  id: string;
  name: string;
  seat: Seat | null; // null = unseated or eliminated
  charges: Charge[];
  payments: Payment[];
  /** Prize money already handed to this player. */
  prizePaid?: PrizePayment[];
}

export interface PrizePayment {
  id: string;
  amount: number; // whole dollars, > 0
  method: 'cash' | 'interac';
}

export interface Charge {
  id: string;
  kind: 'buyin' | 'rebuy';
  amount: number;
}

export interface Payment {
  id: string;
  amount: number; // whole dollars, > 0
  method: PaymentMethod;
}

export interface BlindLevel {
  kind: 'level' | 'break';
  smallBlind: number; // 0 for a break
  bigBlind: number; // 0 for a break
  minutes: number;
}

export interface BlindPlan {
  expectedPlayers: number;
  expectedRebuys: number;
  levelMinutes: number;
  desiredMinutes?: number;
  /** Rebuys and late registration close when this level ends. */
  closeEntriesAfterLevel?: number;
  /** Set once the app has closed them, so reopening by hand sticks. */
  entriesClosed?: boolean;
  levels: BlindLevel[];
  edited: boolean; // true once the host changed a row by hand
}

export interface ChipSet {
  chips: { value: number; count: number }[]; // smallest first
  startingMakeup: number[]; // count per chip, same order
  rebuyMakeup: number[];
}

export interface ClockState {
  startedAt: number | null; // epoch ms of the current run
  elapsedBeforeMs: number; // time banked before the last pause
  adjustMs: number; // from Previous, Next and the +1 / -1 minute buttons
}

export interface AppState {
  tournament: Tournament;
  undoStack: Tournament[]; // previous states, oldest first
  /** Beside the tournament, so Undo never rewinds it. */
  clock: ClockState;
  /** The host's chips: the one thing that survives New tournament. */
  chipSet: ChipSet;
}
