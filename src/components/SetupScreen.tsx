import { useState } from 'react';
import {
  MAX_SEATS,
  MAX_TABLES,
  MIN_SEATS,
  MIN_TABLES,
  money,
  nameError,
  playerOwes,
  seatCapacity,
  startBlockers,
  suggestedTableCount,
  unseatedPlayers,
} from '../logic/logic';
import type { Player, Tournament } from '../logic/types';
import { dispatch } from '../store';
import { NumInput, Toggle } from './common';
import { PayoutEditor } from './PayoutEditor';
import { TableGrid } from './TableGrid';

interface Props {
  t: Tournament;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  openDetail: (id: string) => void;
  openSeatingList: () => void;
}

export function SetupScreen({ t, selectedId, setSelectedId, openDetail, openSeatingList }: Props) {
  const setup = t.status === 'setup';
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const tableNumber = (p: Player) => t.tables.find((tb) => tb.id === p.seat?.tableId)?.number;
  const blockers = startBlockers(t);
  const selected = t.players.find((p) => p.id === selectedId) ?? null;
  const unseated = unseatedPlayers(t).length;

  const addNames = (text: string) => {
    const names = text.split('\n').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (nameError(t, name) || accepted.some((a) => a.toLowerCase() === lower)) rejected.push(name);
      else accepted.push(name);
    }
    if (accepted.length > 0) dispatch({ type: 'addPlayers', names: accepted });
    setMessage(
      rejected.length > 0
        ? `Already registered: ${rejected.join(', ')}. Add a distinguishing initial (for example "${rejected[0]} B").`
        : null,
    );
    setEntry('');
  };

  const onSeat = (tableId: string, seat: number, occupant: Player | null) => {
    if (!selectedId) {
      if (occupant) setSelectedId(occupant.id);
      return;
    }
    if (occupant?.id === selectedId) {
      setSelectedId(null);
      return;
    }
    dispatch({ type: 'seatPlayer', playerId: selectedId, tableId, seat });
    setSelectedId(null);
  };

  return (
    <div className="setup">
      <div className="setup-side">
        <div className="panel">
          <h3>Settings</h3>
          <label className="field">
            <span>Tournament name</span>
            <input className="input grow" value={t.name} onChange={(e) => dispatch({ type: 'setName', name: e.target.value })} />
          </label>
          <label className="field">
            <span>Buy-in ($)</span>
            <NumInput value={t.buyInAmount} min={1} onCommit={(amount) => dispatch({ type: 'setBuyIn', amount })} />
          </label>
          <label className="field">
            <span>Rebuy ($)</span>
            <NumInput value={t.rebuyAmount} min={0} onCommit={(amount) => dispatch({ type: 'setRebuyAmount', amount })} />
          </label>
          {!setup && <p className="hint">A new buy-in or rebuy amount applies to new charges only. Charges already made keep their amount.</p>}
          <label className="field">
            <span>Tables</span>
            <NumInput
              value={t.tables.filter((tb) => tb.open).length}
              min={MIN_TABLES}
              max={MAX_TABLES}
              disabled={!setup}
              onCommit={(count) => dispatch({ type: 'setTableCount', count })}
            />
          </label>
          <label className="field">
            <span>Seats per table</span>
            <NumInput
              value={t.seatsPerTable}
              min={MIN_SEATS}
              max={MAX_SEATS}
              disabled={!setup}
              onCommit={(seats) => dispatch({ type: 'setSeatsPerTable', seats })}
            />
          </label>
          <Toggle label="Rebuys allowed" checked={t.rebuysAllowed} onChange={(value) => dispatch({ type: 'setRebuysAllowed', value })} />
          <Toggle label="Late registration open" checked={t.lateRegOpen} onChange={(value) => dispatch({ type: 'setLateRegOpen', value })} />
          {!setup && <p className="hint">Tables and seats are locked once play starts. Add late players from the Run screen.</p>}
        </div>

        <PayoutEditor t={t} />
      </div>

      {setup && (
        <div className="setup-players panel">
          <h3>
            Players <span className="pill">{t.players.length}</span>
          </h3>
          <textarea
            className="input entry"
            rows={2}
            placeholder="Type a name and press Enter, or paste a list (one name per line)"
            value={entry}
            onChange={(e) => {
              // A pasted list arrives with line breaks: add it straight away.
              if (e.target.value.includes('\n')) addNames(e.target.value);
              else setEntry(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addNames(entry);
              }
            }}
          />
          {message && <p className="error">{message}</p>}
          <div className="player-list">
            {t.players.map((p) => {
              const owes = playerOwes(p);
              return (
                <div
                  key={p.id}
                  className={`player-row${p.id === selectedId ? ' selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                >
                  <span className="grow player-name">
                    {p.name}
                    <small className={p.seat ? '' : 'warn-text'}>{p.seat ? `Table ${tableNumber(p)} · Seat ${p.seat.seat}` : 'no seat'}</small>
                  </span>
                  {owes > 0 && (
                    <button
                      className="owes"
                      title="Mark paid in cash"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'markPaid', playerId: p.id });
                      }}
                    >
                      Owes {money(owes)}
                    </button>
                  )}
                  <button
                    className="btn small icon"
                    aria-label={`Edit ${p.name}`}
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(p.id);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn small icon danger"
                    aria-label={`Remove ${p.name}`}
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedId === p.id) setSelectedId(null);
                      dispatch({ type: 'removePlayer', playerId: p.id });
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {t.players.length === 0 && <p className="hint">No players yet.</p>}
          </div>
        </div>
      )}

      {setup && (
        <div className="setup-seating">
          <div className="toolbar">
            <span className="counter">
              <b>{t.players.length}</b> players
            </span>
            <span className="counter">
              <b>{seatCapacity(t)}</b> seats
            </span>
            <span className="counter">
              suggested tables <b>{suggestedTableCount(t.players.length, t.seatsPerTable)}</b>
            </span>
            <span className="grow" />
            <button
              className="btn"
              disabled={t.players.length === 0}
              onClick={() => {
                if (t.players.some((p) => p.seat) && !window.confirm('Replace the current seating with a new random draw?')) return;
                setSelectedId(null);
                dispatch({ type: 'randomizeAll' });
              }}
            >
              Randomize all
            </button>
            <button className="btn" disabled={unseated === 0} onClick={() => dispatch({ type: 'randomizeUnseated' })}>
              Randomize unseated
            </button>
            <button
              className="btn"
              disabled={!t.players.some((p) => p.seat)}
              onClick={() => {
                if (window.confirm('Clear every seat?')) dispatch({ type: 'clearSeats' });
              }}
            >
              Clear all seats
            </button>
            <button className="btn" onClick={openSeatingList} disabled={t.players.length === 0}>
              Seating list
            </button>
            <button className="btn primary big" disabled={blockers.length > 0} onClick={() => dispatch({ type: 'start' })}>
              Start
            </button>
          </div>
          {blockers.length > 0 && <p className="hint">Start is blocked: {blockers.join(' ')}</p>}
          <p className="selection-bar">
            {selected ? (
              <>
                <b>{selected.name}</b> selected: tap an open seat to place, or an occupied seat to swap.
                {selected.seat && (
                  <button
                    className="btn small"
                    onClick={() => {
                      dispatch({ type: 'unseatPlayer', playerId: selected.id });
                      setSelectedId(null);
                    }}
                  >
                    Unseat
                  </button>
                )}
                <button className="btn small" onClick={() => setSelectedId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              'Tap a player, then tap a seat.'
            )}
          </p>
          <TableGrid
            t={t}
            selectedId={selectedId}
            highlight={null}
            onSeat={onSeat}
            onMarkPaid={(playerId) => dispatch({ type: 'markPaid', playerId })}
          />
        </div>
      )}
    </div>
  );
}
