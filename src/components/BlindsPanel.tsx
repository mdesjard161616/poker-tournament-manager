import { useState } from 'react';
import {
  DEFAULT_LEVEL_MINUTES,
  LEVEL_LENGTHS,
  chipCoverage,
  chipRemovals,
  defaultCloseLevel,
  estimateDuration,
  fitSteps,
  formatBlinds,
  formatDuration,
  levelError,
  makeupError,
  planChips,
  playLevels,
  raiseWarning,
  suggestStructure,
  type PlanInputs,
} from '../logic/blinds';
import { rebuyChipCount } from '../logic/logic';
import type { BlindLevel, ChipSet, Tournament } from '../logic/types';
import { dispatch } from '../store';
import { NumInput } from './common';

const DEFAULT_STACK = 5000;

/** Raising the small blind to or past the big blind moves the big blind to double it. */
function smallBlindPatch(row: BlindLevel, smallBlind: number): Partial<BlindLevel> {
  return smallBlind >= row.bigBlind ? { smallBlind, bigBlind: smallBlind * 2 } : { smallBlind };
}

interface Props {
  t: Tournament;
  chipSet: ChipSet;
  /** Rows before this index are already played and cannot be edited. */
  lockedRows: number;
}

export function BlindsPanel({ t, chipSet, lockedRows }: Props) {
  const plan = t.blinds;
  const [players, setPlayers] = useState(plan?.expectedPlayers ?? (t.players.length >= 2 ? t.players.length : 20));
  const [rebuys, setRebuys] = useState(plan?.expectedRebuys ?? Math.round((t.players.length >= 2 ? t.players.length : 20) / 2));
  const [levelMinutes, setLevelMinutes] = useState(plan?.levelMinutes ?? DEFAULT_LEVEL_MINUTES);
  const [hours, setHours] = useState(plan?.desiredMinutes ? String(Math.floor(plan.desiredMinutes / 60)) : '');
  const [minutes, setMinutes] = useState(plan?.desiredMinutes ? String(plan.desiredMinutes % 60) : '');
  const [message, setMessage] = useState<string | null>(null);
  const [breakAfter, setBreakAfter] = useState(1);

  const startingChips = (t.startingChips ?? 0) > 0 ? t.startingChips! : DEFAULT_STACK;
  const rebuyChips = (t.startingChips ?? 0) > 0 ? rebuyChipCount(t) : DEFAULT_STACK;
  const desired = hours.trim() === '' && minutes.trim() === '' ? undefined : (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const inputs: PlanInputs = { expectedPlayers: players, expectedRebuys: rebuys, startingChips, rebuyChips, levelMinutes, desiredMinutes: desired };

  const apply = (planInputs: PlanInputs) => {
    const suggestion = suggestStructure(planInputs, chipSet.chips.map((c) => c.value));
    if ('error' in suggestion) {
      setMessage(suggestion.error);
      return;
    }
    if (plan?.edited && !window.confirm('Replace the structure? The levels and breaks you changed by hand will be lost.')) return;
    setMessage(null);
    if ((t.startingChips ?? 0) <= 0) dispatch({ type: 'setStartingChips', chips: DEFAULT_STACK });
    setLevelMinutes(suggestion.levelMinutes);
    dispatch({
      type: 'setBlindPlan',
      plan: {
        expectedPlayers: planInputs.expectedPlayers,
        expectedRebuys: planInputs.expectedRebuys,
        levelMinutes: suggestion.levelMinutes,
        ...(planInputs.desiredMinutes !== undefined ? { desiredMinutes: planInputs.desiredMinutes } : {}),
        closeEntriesAfterLevel: defaultCloseLevel(suggestion.rows),
        entriesClosed: plan?.entriesClosed,
        levels: suggestion.rows,
        edited: false,
      },
    });
  };

  const estimate = plan ? estimateDuration(plan.levels, planChips(plan, startingChips, rebuyChips)) : null;

  // Shorter and Longer step through every valid combination of level length and number of levels.
  const step = (direction: -1 | 1) => {
    const steps = fitSteps(inputs);
    const current = estimate?.likely.minutes ?? 0;
    const next = direction < 0 ? [...steps].reverse().find((o) => o.totalMinutes < current) : steps.find((o) => o.totalMinutes > current);
    if (!next) {
      setMessage(direction < 0 ? 'This is the shortest structure for this field.' : 'This is the longest structure for this field.');
      return;
    }
    setHours(String(Math.floor(next.totalMinutes / 60)));
    setMinutes(String(next.totalMinutes % 60));
    apply({ ...inputs, desiredMinutes: next.totalMinutes });
  };

  const rows = plan?.levels ?? [];
  const removals = chipRemovals(rows, chipSet.chips.map((c) => c.value));
  const editRow = (index: number, patch: Partial<BlindLevel>) => dispatch({ type: 'editBlindRow', index, row: { ...rows[index], ...patch } });
  const valid = (index: number, patch: Partial<BlindLevel>) => levelError({ ...rows[index], ...patch }) === null;

  const coverage = chipCoverage(chipSet, players, rebuys);
  const covers = Math.min(...chipSet.chips.map((c, i) => (chipSet.startingMakeup[i] > 0 ? Math.floor(c.count / chipSet.startingMakeup[i]) : Infinity)));
  const startError = makeupError(chipSet, chipSet.startingMakeup, startingChips);
  const rebuyError = makeupError(chipSet, chipSet.rebuyMakeup, rebuyChips);

  let levelNumber = 0;

  return (
    <div className="setup-blinds">
      <div className="panel">
        <h3>Blinds</h3>
        <label className="field">
          <span>Expected players</span>
          <NumInput value={players} min={2} max={50} onCommit={setPlayers} />
        </label>
        <label className="field">
          <span>Expected rebuys</span>
          <NumInput value={rebuys} min={0} onCommit={setRebuys} />
        </label>
        <p className="hint">
          Starting stack {startingChips.toLocaleString('en-CA')}, rebuy stack {rebuyChips.toLocaleString('en-CA')}
          {(t.startingChips ?? 0) > 0 ? ' (from Settings).' : ' (the default; change it in Settings).'}
        </p>
        <div className="field">
          <span>Level length</span>
          <span className="row wrap end">
            {LEVEL_LENGTHS.map((m) => (
              <button key={m} className={`btn small${levelMinutes === m ? ' active' : ''}`} onClick={() => setLevelMinutes(m)}>
                {m}
              </button>
            ))}
          </span>
        </div>
        <div className="field">
          <span>Desired length</span>
          <span className="row">
            <input className="input num narrow" type="number" inputMode="numeric" aria-label="Desired hours" placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)} />
            <span className="prefix">h</span>
            <input className="input num narrow" type="number" inputMode="numeric" aria-label="Desired minutes" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </span>
        </div>
        <p className="hint">Leave the desired length empty to use the level length as chosen. With a desired length, the app picks the level length.</p>
        <div className="row wrap">
          <button className="btn primary grow" onClick={() => apply(inputs)}>
            {plan ? 'Suggest again' : 'Suggest a structure'}
          </button>
          {plan && (
            <>
              <button className="btn" onClick={() => step(-1)}>
                Shorter
              </button>
              <button className="btn" onClick={() => step(1)}>
                Longer
              </button>
            </>
          )}
        </div>
        {message && <p className="error">{message}</p>}
        {estimate && (
          <p className="set-aside">
            About <b>{formatDuration(estimate.likely.minutes)}</b>, between {formatDuration(estimate.earliest.minutes)} and{' '}
            {formatDuration(estimate.latest.minutes)}.
            <small>
              {' '}
              Likely to end at {formatBlinds(estimate.likely.smallBlind, estimate.likely.bigBlind)}; earliest at{' '}
              {formatBlinds(estimate.earliest.smallBlind, estimate.earliest.bigBlind)}, latest at{' '}
              {formatBlinds(estimate.latest.smallBlind, estimate.latest.bigBlind)}. A rule of thumb, for {plan!.expectedPlayers} players and{' '}
              {plan!.expectedRebuys} rebuys.
            </small>
          </p>
        )}
        {plan && (
          <>
            <label className="field">
              <span>Close rebuys and late registration after level</span>
              <NumInput
                value={plan.closeEntriesAfterLevel ?? 0}
                min={0}
                max={playLevels(rows).length}
                onCommit={(n) => dispatch({ type: 'setCloseEntriesAfter', levelNumber: n })}
              />
            </label>
            <p className="hint">0 leaves them open until you close them yourself.</p>
          </>
        )}
      </div>

      {plan && (
        <div className="panel">
          <h3>
            Structure <span className="pill">{playLevels(rows).length} levels</span>
            {plan.edited && <span className="hint"> edited by hand</span>}
          </h3>
          <div className="blind-rows">
            <div className="blind-row head">
              <span>#</span>
              <span>Small</span>
              <span>Big</span>
              <span>Min</span>
              <span />
            </div>
            {rows.map((row, i) => {
              const locked = i < lockedRows;
              if (row.kind === 'break') {
                return (
                  <div className="blind-row break" key={i}>
                    <span />
                    <span className="break-label">Break</span>
                    <span className="row">
                      <button className="btn small icon" aria-label="Move break up" disabled={locked || i === 0} onClick={() => dispatch({ type: 'moveBlindRow', index: i, by: -1 })}>
                        ▲
                      </button>
                      <button className="btn small icon" aria-label="Move break down" disabled={locked || i === rows.length - 1} onClick={() => dispatch({ type: 'moveBlindRow', index: i, by: 1 })}>
                        ▼
                      </button>
                    </span>
                    <NumInput value={row.minutes} min={1} max={120} disabled={locked} label="Break minutes" onCommit={(n) => editRow(i, { minutes: n })} />
                    <button className="btn small icon danger" aria-label="Remove break" disabled={locked} onClick={() => dispatch({ type: 'removeBlindRow', index: i })}>
                      ✕
                    </button>
                  </div>
                );
              }
              levelNumber++;
              const n = levelNumber;
              const warning = raiseWarning(rows, i);
              const leaving = removals.filter((r) => r.afterLevel === n);
              return (
                <div key={i}>
                  <div className={`blind-row${locked ? ' locked' : ''}`}>
                    <span className="hint">{n}</span>
                    <NumInput value={row.smallBlind} min={25} disabled={locked} label={`Level ${n} small blind`} validate={(v) => valid(i, smallBlindPatch(row, v))} onCommit={(v) => editRow(i, smallBlindPatch(row, v))} />
                    <NumInput value={row.bigBlind} min={50} disabled={locked} label={`Level ${n} big blind`} validate={(v) => valid(i, { bigBlind: v })} onCommit={(v) => editRow(i, { bigBlind: v })} />
                    <NumInput value={row.minutes} min={1} max={180} disabled={locked} label={`Level ${n} minutes`} onCommit={(v) => editRow(i, { minutes: v })} />
                    <button className="btn small icon danger" aria-label={`Remove level ${n}`} disabled={locked} onClick={() => dispatch({ type: 'removeBlindRow', index: i })}>
                      ✕
                    </button>
                  </div>
                  {warning && <p className="row-note bad-text">{warning}</p>}
                  {leaving.map((r) => (
                    <p className="row-note" key={r.value}>
                      After this level: colour up the {r.value.toLocaleString('en-CA')}s
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="hint">Blinds are multiples of 25, with the big blind above the small blind. A value that breaks this snaps back.</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => dispatch({ type: 'addBlindLevel' })}>
              Add level
            </button>
            <span className="grow" />
            <button className="btn small" onClick={() => dispatch({ type: 'addBreakAfter', levelNumber: breakAfter })}>
              Add break after level
            </button>
            <NumInput value={breakAfter} min={1} max={playLevels(rows).length} label="Level to add a break after" onCommit={setBreakAfter} />
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Chip set</h3>
        <div className="chip-rows">
          <div className="chip-row head">
            <span>Chip</span>
            <span>Owned</span>
            <span>Start</span>
            <span>Rebuy</span>
            <span>Needed</span>
          </div>
          {chipSet.chips.map((chip, i) => (
            <div className="chip-row" key={chip.value}>
              <b>{chip.value.toLocaleString('en-CA')}</b>
              <NumInput value={chip.count} min={0} label={`${chip.value} chips owned`} onCommit={(count) => dispatch({ type: 'setChipCount', index: i, count })} />
              <NumInput value={chipSet.startingMakeup[i]} min={0} label={`${chip.value} chips in a starting stack`} onCommit={(count) => dispatch({ type: 'setChipMakeup', stack: 'starting', index: i, count })} />
              <NumInput value={chipSet.rebuyMakeup[i]} min={0} label={`${chip.value} chips in a rebuy stack`} onCommit={(count) => dispatch({ type: 'setChipMakeup', stack: 'rebuy', index: i, count })} />
              <span className={coverage[i].short > 0 ? 'bad-text' : ''}>{coverage[i].needed}</span>
            </div>
          ))}
        </div>
        {startError && <p className="error">Starting stack: {startError}</p>}
        {rebuyError && <p className="error">Rebuy stack: {rebuyError}</p>}
        {coverage
          .filter((c) => c.short > 0)
          .map((c) => (
            <p className="error" key={c.value}>
              {c.value.toLocaleString('en-CA')} chips: {c.needed} needed, {c.owned} owned. Use fewer {c.value.toLocaleString('en-CA')}s per stack or build
              rebuys from larger chips.
            </p>
          ))}
        <p className="hint">
          "Start" and "Rebuy" are the chips in one stack. "Needed" is for {players} players and {rebuys} rebuys.
          {Number.isFinite(covers) && ` This make-up covers ${covers} players before any rebuy.`} The chip set is kept when you start a new
          tournament.
        </p>
      </div>
    </div>
  );
}
