# Poker Tournament Manager Spec

Oct 9, 2026 · @Marc Desjardins

Build a single-device web app that runs alongside an existing blind-clock tool and handles what it lacks: the player list, the table draw, who owes what, eliminations, and alerts to balance or break tables. It targets home tournaments of 10 to 50 players.

## Scope

The app covers one tournament at a time, from registration to payouts, on one laptop or tablet operated by the host.

| Decision | Choice |
| --- | --- |
| Platform | Web app in a browser on one device, no server, no accounts, works offline |
| Field size | 10 to 50 players, 1 to 8 tables, 2 to 10 seats per table |
| Money tracked | Buy-in, rebuys, payments in cash or Interac including partial amounts, prize pool, payouts |
| Late registration | Yes, players can be added after the start until the host closes it |
| Balancing | Alert only: the app says which tables are off, the host chooses who moves and where |
| History | None: no saved roster, no past results, each tournament starts empty |

Out of scope: blind clock and levels, chip counts, add-ons, bounties, dealer button tracking, multi-device sync, a public display view, player accounts.

## Setup

Everything on this screen is editable until the host presses Start; settings marked "live" stay editable during play.

| Setting | Type | Default | Rule |
| --- | --- | --- | --- |
| Tournament name | Text | "Tournament" plus today's date | Optional |
| Buy-in amount | Dollars, whole number | 40 | Greater than 0 |
| Rebuy amount | Dollars, whole number | Same as buy-in | 0 or more |
| Rebuys allowed | Toggle, live | On | Turning it off hides the Rebuy action |
| Late registration open | Toggle, live | On | Turning it off hides Add player during play |
| Number of tables | Integer | ceil(players / seats per table) | 1 to 8 |
| Seats per table | Integer | 9 | 2 to 10, one value for all tables |
| Payout places and percentages | List, live | See Money | Must sum to 100 |
| Payout rounding | Dollars | 5 | 1, 5, 10 or 20 |

Players:

- Add one name at a time with Enter, or paste a list with one name per line.
- Each new player gets one buy-in charge and no payment.
- Names are trimmed. A duplicate name (case-insensitive) is rejected with a message asking for a distinguishing initial.
- Before Start, a player can be renamed or removed. Removing deletes the player's charges.
- The header shows the live count: players, seats available (tables x seats per table), and the suggested table count.

Start is blocked while players > tables x seats per table, while fewer than 2 players are registered, or while any player has no seat.

## Seating

The host can draw every seat at random, place every player by hand, or place some by hand and draw the rest.

Notation used in the rest of this spec: N = active players, T = active tables, S = seats per table.

Random draw ("Randomize all"):

1. Shuffle the players with Fisher-Yates using `crypto.getRandomValues`.
2. Deal them round-robin to tables, so table i (0-based) receives floor(N / T) players, plus 1 if i < N mod T. Table sizes never differ by more than 1.
3. Within each table, give each player a distinct random seat number from 1 to S.
4. If any player is already seated, ask for confirmation before replacing the draw.

Partial draw ("Randomize unseated"): shuffle the unseated players, then place each one at the table with the fewest players (ties broken at random) in a random open seat. Players already seated do not move.

Manual assignment:

- Tap an unseated player, then tap an open seat to place them.
- Tap a seated player, then tap an open seat to move them.
- Tap a seated player, then tap an occupied seat to swap the two.
- "Unseat" returns a player to the unseated list. "Clear all seats" asks for confirmation.

The same tap-to-move and swap gestures work during play. A "Seating list" view shows Name, Table, Seat sorted by name, for reading out the draw.

## Money

Each player carries a list of charges, one buy-in plus one per rebuy, and a separate list of payments, each with an amount and a method (cash or Interac).

Per player, with B = buy-in amount, R = rebuy amount, r = that player's rebuy count:

- Total = B + r x R
- Paid = sum of that player's payments
- Owes = Total - Paid

Charges store their amount at creation. Changing B or R later applies to new charges only, and the app says so when the host edits them during play.

Actions:

- Rebuy: tapping Rebuy on a player opens a three-button prompt, "Cash", "Interac" or "Owes". Cash and Interac add the charge plus a payment of R by that method; Owes adds the charge only.
- Mark paid: one tap on a player's "Owes $X" badge records one cash payment for the full amount owed.
- Payment: opens an amount field prefilled with the amount owed and a Cash or Interac choice. The host lowers the amount for a partial payment. The amount must be above 0 and no more than Owes.
- Fix a mistake: the player's detail panel lists every charge and every payment. Any payment and any rebuy charge can be deleted, and a payment's method can be changed. The buy-in charge cannot be deleted. Deleting a rebuy is blocked if it would leave Paid above Total, with a message to remove a payment first.

Payments stay open after the tournament is Finished, so an Interac transfer that arrives the next day can still be recorded. The "Owes only" filter on the Money screen is then the list of people to follow up with.

The Money screen shows one row per player (Name, Rebuys, Total, Paid, Owes), sortable by any column, with a filter "Owes only" and a totals row. Players who owe are shown first by default, and any nonzero Owes value is highlighted.

Prize pool:

- Pool = sum of all charges, paid or not
- Collected = sum of all payments, shown with its cash and Interac subtotals
- Outstanding = Pool - Collected

Default payout structure, chosen from the number of players when the tournament starts and editable at any time:

| Players | Places paid | Percentages |
| --- | --- | --- |
| 10 to 15 | 3 | 50 / 30 / 20 |
| 16 to 30 | 4 | 45 / 27 / 18 / 10 |
| 31 to 50 | 5 | 40 / 25 / 16 / 11 / 8 |

Payout per place, with U = payout rounding:

- For places 2 and below: payout = round(Pool x percentage / U) x U
- For 1st place: payout = Pool - sum of the other payouts

This keeps the payouts summing exactly to the pool. Payouts recompute on every rebuy and late registration. The Payouts panel labels them "provisional" while rebuys or late registration are open and "final" once both are closed.

## Running the tournament

The tournament has three states: Setup, Running and Finished. Start moves it to Running, and it becomes Finished automatically when one active player remains.

Tapping a seated player opens an action sheet with Rebuy, Eliminate, Move and Payment.

Late registration:

- "Add player" stays available while late registration is open.
- The new player gets an unpaid buy-in charge and a suggested seat: a random open seat at the active table with the fewest players. The host can accept it or tap a different open seat.
- If no seat is open, the app offers to add a table and reports the balance alert that follows.

Rebuys:

- Available on any active player while rebuys are allowed. The player keeps their seat.
- A player who busts and rebuys is never eliminated in the app: the host taps Rebuy instead of Eliminate.

Eliminations:

- Eliminate asks for one confirmation, frees the seat and appends the player to the elimination order.
- Finishing place is derived, never stored: place = total players - elimination index + 1, where the first player out has index 1. This stays correct when a late registrant joins after eliminations have started.
- When two players bust on the same hand, the host eliminates the one who started the hand with fewer chips first.
- "Reinstate" on an eliminated player removes them from the elimination order and asks for a seat. It covers mistakes and a rebuy decided after the fact.
- The last active player is placed 1st and the Results view opens: Place, Name, Payout, Owes.

Undo: a single Undo button reverses the last action of any kind (elimination, rebuy, payment, move, added player) and can be pressed repeatedly back to the start of play.

## Table alerts

After every action the app evaluates three rules in priority order and shows at most one alert, the first that is true.

| Priority | Alert | Condition | Message content |
| --- | --- | --- | --- |
| 1 | Final table | T > 1 and N <= S | "N players left: combine to the final table" |
| 2 | Break a table | T > 1 and N <= (T - 1) x S | "N players fit on T - 1 tables: break one", with the suggested table |
| 3 | Balance | max table count - min table count >= 2 | Each table's count and how many players it must send or receive |

The alert is a persistent banner at the top of the Run screen. It does not block other actions, and it disappears on its own as soon as its condition is false.

Break a table:

- The suggested table is the one with the fewest players; ties go to the highest table number. The host can pick a different one.
- "Break table X" closes that table and moves its players to an unseated tray.
- The host seats each one by tapping an open seat, or presses "Randomize unseated", which fills the smallest tables first and leaves the room balanced.

Final table: the banner offers "Redraw final table", which closes every table but Table 1 and gives all N players a random seat there. The host can instead break tables and seat by hand.

Balance, with low = floor(N / T) and high = ceil(N / T):

- A table with more than high players must send (count - high) players.
- A table with fewer than low players must receive (low - count) players.
- If no table is above high, the senders are the tables with the most players. If no table is below low, the receivers are the tables with the fewest.
- The banner lists senders and receivers, for example "Table 2 (8) sends 1 to Table 4 (6)". The host picks the player and the seat with the normal Move action; the app does not choose.

The Run screen always shows each table's player count, so the host can see the state without waiting for an alert.

## Screens

The app has four screens behind a top navigation bar, and the Run screen is where the host spends the night.

| Screen | Shows | Main actions |
| --- | --- | --- |
| Setup | Settings form, player list with add and paste, table count and size, seat grid | Add or remove players, Randomize all, Randomize unseated, manual seating, Start |
| Run | Alert banner, one card per active table with its seats and player count, unseated tray, counters (players left, total players, rebuys, pool) | Tap player for Rebuy, Eliminate, Move, Payment; Add player; Undo |
| Money | Per-player table of Rebuys, Total, Paid, Owes; totals for Pool, Collected, Outstanding | Mark paid, record a partial payment, open a player's charges and payments, filter to those who owe |
| Results | Payout table by place, elimination order with finishing places | Edit payout percentages and rounding, Reinstate |

UI requirements:

- On each seat, show the player's name, their rebuy count if above 0, and a red "Owes $X" badge if they owe anything. The badge is itself a one-tap Mark paid.
- Rebuy takes two taps from the Run screen: the player, then "Paid now" or "Owes". Eliminate takes three: the player, Eliminate, Confirm.
- A search box on Run and Money finds a player by typing part of the name and highlights their seat.
- Layout targets a landscape tablet or laptop, 1024 px wide and up, with five tables of 10 visible without scrolling at 1280 x 800. Touch targets are at least 44 px.
- A settings menu holds the live toggles (rebuys allowed, late registration open), Export, Import and New tournament.

## Technical requirements

Build it as a static single-page app with Vite, React and TypeScript, with no backend and no network requests at runtime.

- State: one reducer holds the whole tournament. Every user action is a reducer action.
- Logic: the draw, the alert rules, the money totals, the payouts and the finishing places are pure functions in their own module, with no React imports, covered by Vitest unit tests.
- Derived values (Total, Owes, Pool, places, alerts, table counts) are computed from state and never stored.
- Persistence: the state is written to `localStorage` after every action and restored on load. Reloading or closing the browser mid-tournament loses nothing.
- Undo: keep a stack of the previous 200 states, persisted with the tournament. Undo pops one.
- Backup: Export downloads the state as a JSON file and Import restores it after validating the shape.
- New tournament: clears everything after a typed confirmation, which states the Outstanding amount when it is above 0.
- Randomness: `crypto.getRandomValues` only, behind one function that tests can replace with a seeded generator.

Data model:

```ts
type Status = 'setup' | 'running' | 'finished';

interface Tournament {
  name: string;
  status: Status;
  buyInAmount: number;        // whole dollars
  rebuyAmount: number;
  rebuysAllowed: boolean;
  lateRegOpen: boolean;
  seatsPerTable: number;      // S
  payoutPercents: number[];   // index 0 = 1st place, sums to 100
  payoutRounding: number;     // U
  tables: Table[];
  players: Player[];
  eliminationOrder: string[]; // player ids, first out first
}

interface Table {
  id: string;
  number: number;             // 1-based label
  open: boolean;              // false once broken
}

interface Player {
  id: string;
  name: string;
  seat: { tableId: string; seat: number } | null; // null = unseated or eliminated
  charges: Charge[];
  payments: Payment[];
}

interface Charge {
  id: string;
  kind: 'buyin' | 'rebuy';
  amount: number;
}

interface Payment {
  id: string;
  amount: number;             // whole dollars, > 0
  method: 'cash' | 'interac';
}
```

A player is active when their id is not in `eliminationOrder`. N counts active players, and T counts tables with `open: true`.

Build order: logic module with tests, then Setup and seating, then Run with eliminations and alerts, then Money, then Results, then persistence, undo and export.

## Acceptance tests

Each row is a unit test on the logic module, and the build is done when all pass and a full tournament can be run by hand from Setup to Results.

| Area | Given | Expected |
| --- | --- | --- |
| Draw | 27 players, 3 tables, S = 9 | Table counts 9 / 9 / 9, no duplicate seats |
| Draw | 25 players, 3 tables, S = 9 | Table counts 9 / 8 / 8 |
| Draw | 50 players, 6 tables, S = 9 | Table counts 9 / 9 / 8 / 8 / 8 / 8 |
| Start | 30 players, 3 tables, S = 9 | Start blocked: 30 > 27 seats |
| Balance | Counts 8 / 7 / 7 | No alert |
| Balance | Counts 8 / 8 / 6, S = 9 | Balance alert: Table 3 receives 1 from Table 1 or 2 |
| Balance | Counts 9 / 9 / 6, S = 9 | Balance alert: Tables 1 and 2 each send 1, Table 3 receives 2 |
| Break | 4 tables at 7 / 7 / 7 / 7, S = 9, then 1 elimination | Break alert (27 <= 27), suggesting the table with 6 |
| Break | Counts 7 / 7 / 7 / 7, S = 9, no elimination | No break alert (28 > 27) |
| Final table | 2 tables at 5 / 5, S = 9, then 1 elimination | Final table alert (9 <= 9), not a break alert |
| Places | 20 players, 1 eliminated, then 1 late registrant, then 1 more eliminated | First out shows 21st, second out shows 20th |
| Money | B = 40, R = 20, player with 2 rebuys, one cash payment of 50 | Total 80, Paid 50, Owes 30 |
| Money | Same player, then R changed to 30 and 1 more rebuy | Total 110 |
| Pool | 20 players at 40, 12 rebuys at 20 | Pool 1,040 |
| Payouts | Pool 1,040, percentages 45 / 27 / 18 / 10, U = 5 | 470 / 280 / 185 / 105, sum 1,040 |
| Undo | Eliminate a player, then Undo | Player back in the same seat, elimination order unchanged from before |
| Persistence | Reload the page mid-tournament | Identical state, including the undo stack |
| Money | Player with Total 110 and one cash payment of 50, then an Interac payment of 60 | Owes 0; Collected rises by 60 under Interac |
| Money | Player owes 30, payment of 40 entered | Rejected: amount exceeds Owes |
| Money | Tournament Finished, player owes 30, Interac payment of 30 recorded | Accepted: Owes 0, Outstanding drops by 30 |

## Assumptions to confirm

These are choices made without an answer from the host; change any of them before handing the spec to Claude Code.

- [x] All tables share one seat count. Mixed sizes (one table of 10, one of 8) are not supported.
- [x] The prize pool counts unpaid charges, so payouts assume everyone eventually pays.
- [x] Nothing is held back from the pool: no house cut, no dealer tip, no trophy fund.
- [ ] A player can pay in several instalments, each recorded as cash or Interac. Overpayments and change are not tracked.
- [x] The default payout percentages are suggestions, not a standard.
- [x] Break and final-table alerts fire even while late registration is open.
- [x] When a table breaks, a random reseat is offered, although balancing moves stay manual.
- [x] Defaults of a 40 dollar buy-in and 9 seats per table are placeholders.
- [x] Stack is Vite, React and TypeScript.
