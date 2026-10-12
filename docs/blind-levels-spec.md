# Blind Levels and Clock Spec

Oct 12, 2026 · draft for review · adds to [spec.md](spec.md)

The app suggests a blind structure from the expected field, estimates how long the tournament will last, lets the host stretch or shrink it to a target length, and then runs the clock on tournament night. It replaces the separate blind-clock tool.

## Decisions already made

| Question | Answer |
| --- | --- |
| Clock | In the app: current level, countdown, next blinds, breaks, pause and skip |
| Chips | 25, 100, 500, 1,000 and 5,000. There is no 50 chip, so every blind is a multiple of 25 |
| Typical start | 5,000 chips: 8 x 25, 8 x 100, 4 x 500, 2 x 1,000 |
| Antes | None: small blind and big blind only |
| Add-ons | Left out |

## What the host enters

A new "Blinds" panel on the Setup screen asks for the expected night. Two of the inputs already exist in Settings and are reused.

| Input | Default | Note |
| --- | --- | --- |
| Expected players | Players registered so far, or 20 if none | Whole number, 2 to 50 |
| Expected rebuys | One per two players | Total for the night, 0 or more |
| Starting stack | The existing "Starting stack (chips)" setting, 5,000 when empty | Required before a structure can be suggested |
| Rebuy stack | The existing "Rebuy stack (chips)" setting | Same as the starting stack if not set |
| Level length | 20 minutes | 10, 12, 15, 20, 25 or 30 |
| Desired length | Empty | Optional, in hours and minutes |

## How the suggestion is built

The suggestion starts each player 100 big blinds deep and ends at the level where the money is expected to be decided, using blinds from one fixed ladder.

Expected chips in play: C = players x starting stack + rebuys x rebuy stack.

The ladder, small blind / big blind, each step 20% to 50% above the last:

25/50, 50/100, 75/150, 100/200, 150/300, 200/400, 300/600, 400/800, 500/1,000, 600/1,200, 800/1,600, 1,000/2,000, 1,500/3,000, 2,000/4,000, 3,000/6,000, 4,000/8,000, 5,000/10,000, 6,000/12,000, 8,000/16,000, 10,000/20,000, 15,000/30,000, 20,000/40,000, and so on in the same pattern.

Steps:

1. First level: the highest ladder step whose big blind is no more than starting stack / 100. A 5,000 stack starts at 25/50, a 10,000 stack at 50/100.
2. Expected last level: the first ladder step whose big blind is at least C / 20. This is a rule of thumb: a tournament usually ends when the two last players hold about 10 big blinds each on average.
3. The structure is every ladder step from the first level to the expected last level, plus three more steps after it in case the night runs long.
4. A 10-minute break is inserted after every 2 hours of play.

Worked example, a typical night: 20 players at 5,000 and 10 rebuys at 5,000 give C = 150,000. C / 20 = 7,500, so the expected last level is 4,000/8,000. From 25/50 that is 16 levels. At 20 minutes each, with two breaks, the estimate is 5 hours 40 minutes.

## The duration estimate

The estimate is the time from the start to the end of the expected last level, shown with a range.

- Likely: end of the first level with a big blind of at least C / 20.
- Earliest: end of the first level with a big blind of at least C / 30.
- Latest: end of the first level with a big blind of at least C / 10.
- Shown as "About 5 h 40, between 5 h 20 and 6 h 50", with the level each figure corresponds to (here 4,000/8,000, 3,000/6,000 and 8,000/16,000).

During play the estimate recalculates from the real numbers: chips actually in play (registrations and rebuys so far) and the time already elapsed. The Run screen shows "ends around 11:40 pm" next to the average stack.

The three divisors (20, 30, 10) are the only tuning values, and they are untested against your games. They are constants in the logic module, to be adjusted after a few real tournaments if the estimate proves consistently early or late.

## Fitting a desired length

When the host enters a desired length, the app changes the level length and the number of levels so the likely end lands on it, keeping the same first and last blinds.

1. Play time = desired length less the breaks.
2. For each allowed level length, the number of levels is play time / level length, rounded.
3. The app keeps the combination closest to the desired length in which no level raises the blinds by more than 100% and the average raise is closest to 35%.
4. If fewer levels than the full ladder are needed, steps are dropped as evenly as possible; the first and expected last levels always stay.

Worked example: the same night with a desired length of 4 hours gives 15-minute levels and 15 levels (one ladder step dropped), 3 h 45 of play plus one break: 3 h 55.

Limits, with a plain message instead of a bad structure:

- Too short: "The shortest this field can play is about 1 h 30 (10-minute levels, blinds doubling). To go faster, raise the starting blinds or lower the starting stack."
- Too long: "The longest is about 8 h 30 (30-minute levels, every step). To go longer, raise the starting stack."

A single "Shorter / Longer" pair of buttons moves the suggestion to the next shorter or longer valid combination, for the host who has no exact target.

## Chip set

The app knows which chips the host owns, so it can say when a chip is no longer needed and whether the set covers the night.

The set is a setting with one count per chip, prefilled with the host's:

| Chip | Count | Value |
| --- | --- | --- |
| 25 | 300 | 7,500 |
| 100 | 300 | 30,000 |
| 500 | 150 | 75,000 |
| 1,000 | 150 | 150,000 |
| 5,000 | 100 | 500,000 |
| Total | 1,000 | 762,500 |

Stack make-up: the host enters how a starting stack and a rebuy stack are built, as a count per chip. The starting stack is prefilled with 8 / 8 / 4 / 2 / 0 for 5,000. The make-up must add up to the stack size.

Coverage check: for each chip, the app compares players x starting make-up + rebuys x rebuy make-up with the count owned.

- With the typical make-up, the set covers 37 players before any rebuy: the 25s, 100s and 500s all run out at 37 (300 / 8, 300 / 8, 150 / 4).
- When a chip runs short, the Blinds panel says which one and by how much, for example "25 chips: 400 needed, 300 owned. Use fewer 25s per stack or build rebuys from larger chips."
- The check is a warning, not a block.

Removing small chips: a chip can leave the table once no later level has a blind that needs it. The structure table marks the level after which each chip can go, and the clock shows a reminder at that level's end. With the full ladder:

| Chip | Last level that needs it | Reminder |
| --- | --- | --- |
| 25 | 150/300 | "Colour up the 25s" |
| 100 | 800/1,600 | "Colour up the 100s" |
| 500 | 1,500/3,000 | "Colour up the 500s" |

If a removal falls within one level of a break, the app moves the break to that level so chips are exchanged during a pause.

## Editing the structure

The suggestion is a starting point, and every row stays editable before and during play.

- The structure is a table: Level, Small blind, Big blind, Minutes, and break rows.
- The host can change any value, add or remove a level, and add, move or remove a break.
- Blinds must be multiples of 25, with the big blind above the small blind. A level that raises the big blind by more than 100%, or lowers it, shows a warning but is allowed.
- "Suggest again" replaces the table after a confirmation that names what will be lost when rows were edited by hand.
- During play, the current level's blinds and all later rows can be edited; past rows are locked.
- The estimate and the chip-removal marks update on every edit.

## The clock

The clock runs from a start time, not from a ticking counter, so closing the app or locking the phone never loses time.

- Start is separate from the tournament's Start button: the host presses "Start clock" when the first hand is dealt.
- Shown: level number, small blind / big blind, time left in the level, the next level's blinds, and time to the next break.
- Controls: Pause and Resume, Previous level, Next level, add 1 minute, remove 1 minute.
- At 1 minute left and at each level change: a sound, a vibration where the phone supports it, and a colour flash on the clock.
- When the last row ends, the clock keeps adding levels by doubling the blinds, at the last row's length.
- While the Clock tab is open, the phone's screen does not dim or lock. See "Keeping the screen on" below.
- Clock actions are not part of Undo. Undoing an elimination must never rewind the clock, and the clock has its own Previous level control.

Rebuys and late registration: a setting "Close rebuys and late registration at the end of level N" (default: the level before the first break). When that level ends, the app turns both off and shows a banner; the host can turn them back on in Settings.

Phone limits to know about:

- A phone cannot play a sound while its screen is locked or another app is in front. The clock keeps correct time, but the level-change sound only plays while the app is on screen. Leaving the phone on the Clock tab covers the normal case.
- iPhones do not support vibration from a web app; the sound and the flash still work.

## Keeping the screen on

A web app can stop the screen from locking, and the app does so for as long as the Clock tab is the one on screen.

- On the Clock tab, the screen stays on whether the clock is running, paused or not started yet.
- On every other tab the phone dims and locks as usual, so a phone left on the Money screen does not drain its battery.
- The phone ends the hold whenever the app leaves the screen (another app in front, or the phone locked by hand). The app asks for it again each time the Clock tab comes back into view.
- The Clock tab shows a small "Screen stays on" mark while the hold is active. If the phone refuses, it shows "This phone may lock the screen: raise Auto-Lock in the phone's settings" instead.

Where it works and where it does not:

| Device | Result |
| --- | --- |
| Android, Chrome | Works |
| iPhone or iPad, Safari, iOS 16.4 or later | Works |
| iPhone app added to the home screen | Works from iOS 18.4; earlier versions ignore the request, and the fallback message shows |
| Any phone in battery-saver or Low Power Mode | The phone may refuse; the fallback message shows |
| Laptop browsers | Works in Chrome, Edge and Safari |

Keeping the screen on uses more battery over a five-hour night, so the phone running the clock should be plugged in.

## Screens

The clock gets its own tab, and a one-line strip keeps it visible everywhere else.

| Where | What changes |
| --- | --- |
| Setup | New "Blinds" panel: the inputs, the estimate, Shorter / Longer, desired length, the structure table, Suggest again, the chip set and stack make-up with the coverage check |
| Clock (new tab) | Large display readable from across a table: level, blinds, countdown, next blinds, next break, chip-removal reminder, the controls, estimated end time |
| Every other screen | A one-line strip under the header: "Level 6 · 200/400 · 12:40 · next 300/600", tapping it opens the Clock tab |
| Run | Average stack also shown in big blinds, for example "avg stack 7,500 · 19 BB" |

The Clock tab works at 375 px wide and at 1280 x 800, like every other screen. On the phone the bottom bar goes from four tabs to five.

## Technical requirements

The structure generator, the estimate, the chip checks and the clock arithmetic are pure functions in the logic module, with unit tests, like the rest of the app.

```ts
interface BlindLevel {
  kind: 'level' | 'break';
  smallBlind: number;   // 0 for a break
  bigBlind: number;     // 0 for a break
  minutes: number;
}

interface BlindPlan {
  expectedPlayers: number;
  expectedRebuys: number;
  levelMinutes: number;
  desiredMinutes?: number;
  closeEntriesAfterLevel?: number;
  levels: BlindLevel[];
  edited: boolean;        // true once the host changed a row by hand
}

interface ChipSet {
  chips: { value: number; count: number }[];   // smallest first
  startingMakeup: number[];                     // count per chip, same order
  rebuyMakeup: number[];
}

interface ClockState {
  startedAt: number | null;   // epoch ms of the current run
  elapsedBeforeMs: number;    // play time banked before the last pause
  adjustMs: number;           // from Previous, Next and the +1 / -1 minute buttons
}
```

- `BlindPlan` lives in the tournament, so Export, Import and New tournament cover it.
- `ChipSet` is the one thing that survives New tournament, since the host's chips do not change from night to night. This is an exception to the original spec's "each tournament starts empty".
- `ClockState` lives beside the tournament, outside the Undo history, and is saved after every clock action.
- The current level, the time left and the chip-removal marks are derived; they are never stored.
- The sound is generated in the browser. No file is downloaded and nothing needs a network.
- The screen hold uses the browser's Screen Wake Lock. It is requested when the Clock tab opens and when the page becomes visible again on that tab, and released when the host leaves the tab. A refusal is caught and shown, never an error.
- Saved tournaments from before this change load with no blind plan and no clock.

Build order: generator and estimate with tests, then the Setup panel, then the chip set and its checks, then the clock arithmetic with tests, then the Clock tab and strip, then sound, vibration and keeping the screen on.

## Acceptance tests

Each row is a unit test on the logic module, except the three "Screen" rows, which are checked by hand on a phone. "Typical night" is 20 players at 5,000 and 10 rebuys at 5,000.

| Area | Given | Expected |
| --- | --- | --- |
| First level | Starting stack 5,000 | 25/50 |
| First level | Starting stack 10,000 | 50/100 |
| Last level | Typical night | Expected last level 4,000/8,000 |
| Structure | Typical night, 20-minute levels, no desired length | 16 levels to the expected last, 3 more after, breaks after levels 6 and 12 |
| Estimate | Typical night | Likely 5 h 40, earliest 5 h 20 at 3,000/6,000, latest 6 h 50 at 8,000/16,000 |
| Fit | Typical night, desired length 4 h | 15-minute levels, 15 levels to the expected last, likely end 3 h 55 |
| Fit | Typical night, desired length 1 h | Rejected, shortest possible length 1 h 30 |
| Fit | Any fitted structure | No raise above 100%, first and expected last levels kept, big blinds strictly increasing |
| Ladder | Every suggested level | Both blinds are multiples of 25 |
| Live estimate | 25 players and 15 rebuys actually recorded | Recalculated from 200,000 chips, not from the expected 150,000 |
| Chip removal | Full ladder | 25s after 150/300, 100s after 800/1,600, 500s after 1,500/3,000 |
| Chip removal | Structure with 75/150 edited out and 150/300 kept | 25s still needed until 150/300 |
| Coverage | Typical make-up, 37 players, no rebuys | Covered exactly |
| Coverage | Typical make-up, 38 players | Short of 25s, 100s and 500s by 4, 4 and 2 |
| Make-up | 8 / 8 / 4 / 2 / 0 for a 5,000 stack | Accepted; 8 / 8 / 4 / 1 / 0 rejected, adds up to 4,000 |
| Clock | Started 25 minutes ago, 20-minute levels | Level 2, 15:00 left |
| Clock | Paused for 10 minutes, then resumed | The 10 minutes are not counted |
| Clock | Next level pressed with 8:00 left | Next level starts at its full length |
| Clock | Reload mid-level | Same level and same time left, to the second |
| Clock | Break row reached | Shown as a break with its own countdown; blinds unchanged until it ends |
| Clock | Past the last row | A new level with doubled blinds |
| Undo | Eliminate, then Undo, while the clock runs | Clock unaffected |
| Entries | End of the chosen closing level | Rebuys and late registration turned off |
| Screen | Phone left on the Clock tab past its Auto-Lock time | Screen still on, "Screen stays on" shown |
| Screen | Switch to another app and back to the Clock tab | Screen stays on again without any tap |
| Screen | Phone left on the Run tab | Locks as usual |

## Assumptions to confirm

These are choices made without an answer from the host; change any of them before the build.

- [ ] Each player starts 100 big blinds deep (5,000 chips start at 25/50).
- [ ] The tournament is expected to end when the big blind reaches about 1/20 of the chips in play.
- [ ] Default level length is 20 minutes, and the allowed lengths are 10, 12, 15, 20, 25 and 30.
- [ ] A 10-minute break after every 2 hours of play, moved by up to one level to line up with removing a chip.
- [ ] Rebuys and late registration close automatically at a chosen level, with the host able to reopen them.
- [ ] The clock is started by its own button, separately from the tournament's Start.
- [ ] The clock gets a fifth tab rather than living inside the Run screen.
- [ ] The screen is kept on only on the Clock tab, not on the other tabs while the clock runs.
- [ ] The app reminds the host to remove 25s, 100s and 500s once the blinds no longer need them.
- [ ] The app checks the chip set against the expected field but does not work out the stack make-up itself; the host enters it.
- [ ] The chip set is remembered across tournaments; everything else still starts empty.
- [ ] One structure for the whole field: no separate final-table levels.
