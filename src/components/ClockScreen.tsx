import { useState } from 'react';
import { playSignal, unlockSound, useWakeLock } from '../clock';
import {
  chipRemovals,
  clockRunning,
  clockStarted,
  estimateDuration,
  formatBlinds,
  formatCountdown,
  formatDuration,
  planChips,
  type ClockPosition,
} from '../logic/blinds';
import { chipsInPlay, rebuyChipCount } from '../logic/logic';
import type { ClockState, Tournament } from '../logic/types';
import { dispatch } from '../store';

interface Props {
  t: Tournament;
  clock: ClockState;
  position: ClockPosition | null;
  elapsedMs: number;
  now: number;
  flash: boolean;
  goToSetup: () => void;
}

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

/** Chips actually handed out once play has started, the expected field before that. */
export function chipsForEstimate(t: Tournament): number {
  const plan = t.blinds!;
  const actual = t.status === 'setup' ? null : chipsInPlay(t);
  return actual ?? planChips(plan, t.startingChips ?? 0, rebuyChipCount(t));
}

export function ClockScreen({ t, clock, position, elapsedMs, now, flash, goToSetup }: Props) {
  // The screen stays on for as long as this tab is the one showing.
  const wake = useWakeLock(true);
  const [soundNote, setSoundNote] = useState<string | null>(null);
  const plan = t.blinds;

  if (!plan || !position) {
    return (
      <div className="empty-state">
        <p>No blind structure yet.</p>
        <button className="btn primary" onClick={goToSetup}>
          Set up the blinds
        </button>
      </div>
    );
  }

  const running = clockRunning(clock);
  const started = clockStarted(clock);
  const act = (action: Parameters<typeof dispatch>[0]) => {
    unlockSound();
    dispatch(action);
  };

  const removals = chipRemovals(plan.levels, undefined).filter((r) => r.afterLevel === position.levelNumber);
  const estimate = estimateDuration(plan.levels, chipsForEstimate(t));
  const endIn = (minutes: number) => minutes * 60000 - elapsedMs;

  return (
    <div className={`clock${flash ? ' flash' : ''}${position.msLeft <= 60000 && running ? ' last-minute' : ''}`}>
      <p className={`wake ${wake}`}>
        {wake === 'on' && 'Screen stays on'}
        {wake === 'refused' && "This phone may lock the screen: raise Auto-Lock in the phone's settings"}
      </p>

      <div className="clock-face">
        <div className="clock-level">{position.isBreak ? 'Break' : `Level ${position.levelNumber}`}</div>
        <div className="clock-blinds">{position.isBreak ? 'Break' : formatBlinds(position.smallBlind, position.bigBlind)}</div>
        <div className="clock-time" role="timer">
          {formatCountdown(position.msLeft)}
        </div>
        {!running && <div className="clock-paused">{started ? 'Paused' : 'Not started'}</div>}
        <div className="clock-next">
          {position.next && (
            <span>
              Next <b>{formatBlinds(position.next.smallBlind, position.next.bigBlind)}</b>
            </span>
          )}
          {position.msToNextBreak !== null && (
            <span>
              Break in <b>{formatCountdown(position.msToNextBreak)}</b>
            </span>
          )}
        </div>
        {removals.map((r) => (
          <div className="clock-chips" key={r.value}>
            {position.isBreak ? 'Now' : 'At the end of this level'}: colour up the {r.value.toLocaleString('en-CA')}s
          </div>
        ))}
      </div>

      <div className="clock-controls">
        {running ? (
          <button className="btn big" onClick={() => act({ type: 'clockPause', now: Date.now() })}>
            Pause
          </button>
        ) : (
          <button className="btn primary big" onClick={() => act({ type: 'clockStart', now: Date.now() })}>
            {started ? 'Resume' : 'Start clock'}
          </button>
        )}
        <button className="btn" onClick={() => act({ type: 'clockPrevious', now: Date.now() })}>
          ◀ Previous
        </button>
        <button className="btn" onClick={() => act({ type: 'clockNext', now: Date.now() })}>
          Next ▶
        </button>
        <button className="btn" onClick={() => act({ type: 'clockAdjust', now: Date.now(), minutes: -1 })}>
          −1 min
        </button>
        <button className="btn" onClick={() => act({ type: 'clockAdjust', now: Date.now(), minutes: 1 })}>
          +1 min
        </button>
      </div>

      {estimate && (
        <p className="clock-estimate">
          {started ? (
            endIn(estimate.likely.minutes) > 0 ? (
              <>
                Likely to end around <b>{timeOfDay(now + endIn(estimate.likely.minutes))}</b>, at {formatBlinds(estimate.likely.smallBlind, estimate.likely.bigBlind)}
                {endIn(estimate.latest.minutes) > 0 && (
                  <>
                    {' '}
                    (between {timeOfDay(now + Math.max(0, endIn(estimate.earliest.minutes)))} and {timeOfDay(now + endIn(estimate.latest.minutes))})
                  </>
                )}
                {!running && ' if resumed now'}
              </>
            ) : (
              <>Past the likely end ({formatBlinds(estimate.likely.smallBlind, estimate.likely.bigBlind)}): it could finish any time.</>
            )
          ) : (
            <>
              About <b>{formatDuration(estimate.likely.minutes)}</b>, between {formatDuration(estimate.earliest.minutes)} and{' '}
              {formatDuration(estimate.latest.minutes)}
            </>
          )}
        </p>
      )}

      <div className="row wrap clock-foot">
        <button className="btn small" onClick={goToSetup}>
          Edit the levels
        </button>
        <button
          className="btn small"
          onClick={() => {
            unlockSound();
            setSoundNote(
              playSignal('level')
                ? 'You should hear three beeps. Nothing? Turn the volume up; on an older iPhone also flip the ring/silent switch to ring.'
                : 'The phone was not ready for sound. Tap Test sound once more.',
            );
          }}
        >
          Test sound
        </button>
        {started && (
          <button
            className="btn small danger"
            onClick={() => {
              if (window.confirm('Reset the clock to the start of level 1?')) dispatch({ type: 'clockReset' });
            }}
          >
            Reset clock
          </button>
        )}
      </div>
      {soundNote && <p className="hint">{soundNote}</p>}
    </div>
  );
}
