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
  /** A share of the pool set aside before prizes, for example for a charity night. */
  holdback?: { percent: number; label: string };
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

export interface AppState {
  tournament: Tournament;
  undoStack: Tournament[]; // previous states, oldest first
}
