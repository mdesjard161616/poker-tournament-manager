import { useState } from 'react';
import {
  MAX_REBUYS_AT_ONCE,
  MAX_TABLES,
  activePlayers,
  computeAlert,
  holdbackAmount,
  money,
  nameError,
  openTables,
  payoutPool,
  playerOwes,
  prizePool,
  suggestSeat,
  tableCounts,
  totalRebuys,
  unseatedPlayers,
} from '../logic/logic';
import type { Player, Seat, Tournament } from '../logic/types';
import { dispatch, getState } from '../store';
import { Modal } from './common';
import { TableGrid } from './TableGrid';

interface Props {
  t: Tournament;
  canUndo: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  openDetail: (id: string) => void;
  openSeatingList: () => void;
  goTo: (screen: 'setup' | 'results') => void;
}

export function RunScreen({ t, canUndo, selectedId, setSelectedId, openDetail, openSeatingList, goTo }: Props) {
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [rebuys, setRebuys] = useState(1);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  if (t.status === 'setup') {
    return (
      <div className="empty-state">
        <p>The tournament has not started yet.</p>
        <button className="btn primary" onClick={() => goTo('setup')}>
          Go to Setup
        </button>
      </div>
    );
  }

  const running = t.status === 'running';
  const alert = computeAlert(t);
  const tray = unseatedPlayers(t);
  const active = activePlayers(t);
  const selected = active.find((p) => p.id === selectedId) ?? null;
  const sheetPlayer = active.find((p) => p.id === sheetId) ?? null;
  const query = search.trim().toLowerCase();
  const highlight = query ? new Set(t.players.filter((p) => p.name.toLowerCase().includes(query)).map((p) => p.id)) : null;
  const found = highlight ? t.players.filter((p) => highlight.has(p.id)) : [];
  const tableNumber = (p: Player) => t.tables.find((tb) => tb.id === p.seat?.tableId)?.number;

  const closeSheet = () => {
    setSheetId(null);
    setConfirmOut(false);
    setRebuys(1);
  };

  const onSeat = (tableId: string, seat: number, occupant: Player | null) => {
    if (selected) {
      if (occupant?.id !== selected.id) dispatch({ type: 'seatPlayer', playerId: selected.id, tableId, seat });
      setSelectedId(null);
      return;
    }
    if (occupant) setSheetId(occupant.id);
  };

  const breakTable = (tableId: string, number: number) => {
    if (window.confirm(`Break Table ${number}? Its players move to the unseated tray.`)) dispatch({ type: 'breakTable', tableId });
  };

  return (
    <div className="run">
      <div className="toolbar">
        <span className="counter">
          <b>{active.length}</b> left
        </span>
        <span className="counter">
          <b>{t.players.length}</b> players
        </span>
        <span className="counter">
          <b>{totalRebuys(t)}</b> rebuys
        </span>
        <span className="counter">
          pool <b>{money(prizePool(t))}</b>
        </span>
        {holdbackAmount(t) > 0 && (
          <span className="counter">
            prizes <b>{money(payoutPool(t))}</b>
          </span>
        )}
        <input
          className="input search"
          type="search"
          placeholder="Find a player"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {query && (
          <span className="hint">
            {found.length === 0
              ? 'no match'
              : found
                  .slice(0, 3)
                  .map((p) => `${p.name}: ${p.seat ? `T${tableNumber(p)} S${p.seat.seat}` : active.includes(p) ? 'unseated' : 'out'}`)
                  .join(' · ')}
          </span>
        )}
        <span className="grow" />
        <button className="btn" onClick={openSeatingList}>
          Seating list
        </button>
        {running && t.lateRegOpen && (
          <button className="btn" onClick={() => setAdding(true)}>
            Add player
          </button>
        )}
        <button className="btn" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
          Undo
        </button>
      </div>

      {!running && (
        <div className="banner done">
          <span>Tournament finished.</span>
          <button className="btn small" onClick={() => goTo('results')}>
            Open Results
          </button>
        </div>
      )}

      {alert && (
        <div className={`banner ${alert.kind}`} role="status">
          <span className="banner-tag">{alert.kind === 'final' ? 'Final table' : alert.kind === 'break' ? 'Break a table' : 'Balance'}</span>
          <span className="grow">{alert.message}</span>
          {alert.kind === 'final' && (
            <button
              className="btn small"
              onClick={() => {
                if (window.confirm('Close every other table and give all players a random seat at the final table?')) {
                  dispatch({ type: 'redrawFinalTable' });
                }
              }}
            >
              Redraw final table
            </button>
          )}
          {alert.kind === 'break' && (
            <>
              <button className="btn small" onClick={() => breakTable(alert.suggested.tableId, alert.suggested.number)}>
                Break Table {alert.suggested.number} ({alert.suggested.count})
              </button>
              <select
                className="input"
                aria-label="Break a different table"
                value=""
                onChange={(e) => {
                  const pick = tableCounts(t).find((c) => c.tableId === e.target.value);
                  if (pick) breakTable(pick.tableId, pick.number);
                }}
              >
                <option value="">or another…</option>
                {tableCounts(t)
                  .filter((c) => c.tableId !== alert.suggested.tableId)
                  .map((c) => (
                    <option key={c.tableId} value={c.tableId}>
                      Table {c.number} ({c.count})
                    </option>
                  ))}
              </select>
            </>
          )}
        </div>
      )}

      {tableCounts(t).length > 1 && (
        <div className="jump">
          {tableCounts(t).map((c) => (
            <button
              key={c.tableId}
              className="btn small"
              aria-label={`Go to Table ${c.number}`}
              onClick={() => document.getElementById(`table-${c.number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              T{c.number} <span>{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {(tray.length > 0 || selected) && (
        <div className="tray">
          <b>{tray.length > 0 ? `Unseated (${tray.length})` : 'Moving'}</b>
          {tray.map((p) => (
            <button
              key={p.id}
              className={`btn small${p.id === selectedId ? ' active' : ''}${highlight?.has(p.id) ? ' found' : ''}`}
              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
            >
              {p.name}
            </button>
          ))}
          {selected && (
            <span className="hint">
              <b>{selected.name}</b>: tap an open seat, or an occupied seat to swap.
            </span>
          )}
          <span className="grow" />
          {selected && (
            <button className="btn small" onClick={() => setSelectedId(null)}>
              Cancel
            </button>
          )}
          {tray.length > 0 && (
            <button className="btn small primary" onClick={() => dispatch({ type: 'randomizeUnseated' })}>
              Randomize unseated
            </button>
          )}
        </div>
      )}

      <TableGrid
        t={t}
        selectedId={selected?.id ?? null}
        highlight={highlight}
        onSeat={onSeat}
        onMarkPaid={(playerId) => dispatch({ type: 'markPaid', playerId })}
      />

      {sheetPlayer && (
        <Modal title={sheetPlayer.name} onClose={closeSheet}>
          {playerOwes(sheetPlayer) > 0 && <p className="hint">Owes {money(playerOwes(sheetPlayer))}</p>}
          {running && t.rebuysAllowed && (
            <div className="panel">
              <h3>
                Rebuy {rebuys > 1 ? `${rebuys} × ${money(t.rebuyAmount)} = ${money(rebuys * t.rebuyAmount)}` : money(t.rebuyAmount)}
              </h3>
              <div className="row">
                {Array.from({ length: MAX_REBUYS_AT_ONCE }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`btn small grow${n === rebuys ? ' active' : ''}`}
                    aria-label={`${n} rebuy${n === 1 ? '' : 's'}`}
                    onClick={() => setRebuys(n)}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
              <div className="row">
                {(['cash', 'interac', 'owes'] as const).map((method) => (
                  <button
                    key={method}
                    className="btn primary grow"
                    onClick={() => {
                      dispatch({ type: 'rebuy', playerId: sheetPlayer.id, method, count: rebuys });
                      closeSheet();
                    }}
                  >
                    {method === 'cash' ? 'Cash' : method === 'interac' ? 'Interac' : 'Owes'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="row wrap">
            {running &&
              (confirmOut ? (
                <button
                  className="btn danger grow"
                  onClick={() => {
                    dispatch({ type: 'eliminate', playerId: sheetPlayer.id });
                    closeSheet();
                  }}
                >
                  Confirm: {sheetPlayer.name} is out
                </button>
              ) : (
                <button className="btn danger grow" onClick={() => setConfirmOut(true)}>
                  Eliminate
                </button>
              ))}
            {running && (
              <button
                className="btn grow"
                onClick={() => {
                  setSelectedId(sheetPlayer.id);
                  closeSheet();
                }}
              >
                Move
              </button>
            )}
            <button
              className="btn grow"
              onClick={() => {
                openDetail(sheetPlayer.id);
                closeSheet();
              }}
            >
              Payment
            </button>
          </div>
        </Modal>
      )}

      {adding && (
        <AddPlayerDialog
          t={t}
          onClose={() => setAdding(false)}
          onPickSeat={(playerId) => {
            setSelectedId(playerId);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddPlayerDialog(props: { t: Tournament; onClose: () => void; onPickSeat: (playerId: string) => void }) {
  const { t } = props;
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Seat | null>(() => suggestSeat(t));
  const [tableAdded, setTableAdded] = useState(false);

  // The suggestion goes stale if the seat is taken or its table closes while the dialog is open.
  const table = suggestion && t.tables.find((tb) => tb.id === suggestion.tableId && tb.open);
  const seat = table && !t.players.some((p) => p.seat?.tableId === suggestion!.tableId && p.seat.seat === suggestion!.seat) ? suggestion : null;
  const alert = computeAlert(t);

  const add = (target: Seat | null) => {
    const problem = nameError(t, name);
    setError(problem);
    if (problem) return;
    dispatch({ type: 'addLatePlayer', name, seat: target });
    const added = getState().tournament.players.find((p) => p.name === name.trim());
    if (!target && added) props.onPickSeat(added.id);
    else props.onClose();
  };

  return (
    <Modal title="Add a late player" onClose={props.onClose}>
      <input
        className="input grow"
        autoFocus
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && seat) add(seat);
        }}
      />
      {error && <p className="error">{error}</p>}
      <p className="hint">Gets an unpaid buy-in of {money(t.buyInAmount)}.</p>
      {seat && table ? (
        <div className="row wrap">
          <button className="btn primary grow" onClick={() => add(seat)}>
            Add at Table {table.number}, Seat {seat.seat}
          </button>
          <button className="btn grow" onClick={() => add(null)}>
            Add and pick a seat
          </button>
        </div>
      ) : (
        <div className="panel">
          <p>No seat is open.</p>
          {openTables(t).length < MAX_TABLES ? (
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'addTable' });
                setSuggestion(suggestSeat(getState().tournament));
                setTableAdded(true);
              }}
            >
              Add a table
            </button>
          ) : (
            <p className="hint">All {MAX_TABLES} tables are in use.</p>
          )}
        </div>
      )}
      {tableAdded && alert && <p className="banner balance">After adding the table: {alert.message}</p>}
    </Modal>
  );
}
