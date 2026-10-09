import { useState } from 'react';
import {
  activePlayers,
  dealError,
  dealPool,
  evenDeal,
  finishingPlace,
  money,
  ordinal,
  payoutsAreFinal,
  playerOwes,
  settleAmount,
  settlement,
} from '../logic/logic';
import type { Player, Tournament } from '../logic/types';
import { dispatch } from '../store';
import { Modal } from './common';
import { PayoutEditor } from './PayoutEditor';

interface Row {
  p: Player;
  label: string;
  winner: boolean;
}

export function ResultsScreen({ t, onReinstate, openDetail }: { t: Tournament; onReinstate: (id: string) => void; openDetail: (id: string) => void }) {
  const [dealing, setDealing] = useState(false);
  const active = activePlayers(t);

  const dealRows: Row[] = (t.deal ?? [])
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .flatMap((d) => {
      const p = t.players.find((x) => x.id === d.playerId);
      return p ? [{ p, label: 'Deal', winner: false }] : [];
    });
  const placedRows: Row[] = t.players
    .map((p) => ({ p, place: finishingPlace(t, p.id) }))
    .filter((r): r is { p: Player; place: number } => r.place !== null)
    .sort((a, b) => a.place - b.place)
    .map(({ p, place }) => ({ p, label: ordinal(place), winner: place === 1 }));
  const rows = [...dealRows, ...placedRows];

  return (
    <div className="results">
      <div className="results-side">
        <PayoutEditor t={t} />
      </div>
      <div className="panel results-main">
        <h3>
          {t.status === 'finished' ? (t.deal ? 'Final results · deal' : 'Final results') : 'Elimination order'}
          {t.status === 'running' && <span className="hint"> {active.length} still in</span>}
        </h3>
        {t.status === 'running' && active.length >= 2 && (
          <div className="row wrap">
            <button className="btn" onClick={() => setDealing(true)}>
              Make a deal…
            </button>
            <span className="hint">When the players still in agree to split the money.</span>
          </div>
        )}
        {t.deal && (
          <div className="row wrap">
            <span className="hint grow">The players still in agreed on these amounts instead of playing out the places.</span>
            <button
              className="btn small"
              onClick={() => {
                if (window.confirm('Cancel the deal and resume play?')) dispatch({ type: 'cancelDeal' });
              }}
            >
              Cancel deal
            </button>
          </div>
        )}
        <table className="grid">
          <thead>
            <tr>
              <th>Place</th>
              <th>Name</th>
              <th className="right">Prize</th>
              <th className="right">Owes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, label, winner }) => {
              const owes = playerOwes(p);
              return (
                <tr key={p.id} className={`clickable${winner ? ' winner' : ''}`} onClick={() => openDetail(p.id)}>
                  <td>{label}</td>
                  <td>{p.name}</td>
                  <td className="right">
                    <PrizeCell t={t} p={p} />
                  </td>
                  <td className="right">
                    {owes > 0 ? (
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
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="right">
                    {!t.deal && t.eliminationOrder.includes(p.id) && (
                      <button
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReinstate(p.id);
                        }}
                      >
                        Reinstate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Nobody has been eliminated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.some(({ p }) => settleAmount(t, p) > 0) && (
          <p className="hint">
            "Pay" is the prize less what that player still owes. "Settle from prize" records that debt as paid out of the prize, so they
            drop off the list of people who owe. If they pay you instead, tap their Owes badge and the full prize shows again.
          </p>
        )}
        {payoutsAreFinal(t) && rows.some(({ p }) => settlement(t, p).toPay > 0) && (
          <p className="hint">Tap Cash or Interac when you hand a prize over. The Money screen then shows what should be left in the cash box.</p>
        )}
        <p className="hint">Tap a player for their payments, or to reinstate them.</p>
      </div>
      {dealing && <DealDialog t={t} onClose={() => setDealing(false)} />}
    </div>
  );
}

function PrizeCell({ t, p }: { t: Tournament; p: Player }) {
  const s = settlement(t, p);
  const pending = settleAmount(t, p);
  if (s.prize <= 0 && s.settled <= 0 && s.paidOut <= 0) return null;

  const methods = [...new Set((p.prizePaid ?? []).map((pay) => (pay.method === 'cash' ? 'cash' : 'Interac')))].join(' + ');
  const paidInFull = s.paidOut > 0 && s.toPay === 0;
  const parts = [`prize ${money(s.prize)}`];
  if (s.settled > 0) parts.push(`− ${money(s.settled)} settled`);
  if (pending > 0) parts.push(s.stillOwes > 0 ? `− ${money(pending)} of ${money(s.owes)} owed` : `− owes ${money(s.owes)}`);
  if (s.paidOut > 0 && !paidInFull) parts.push(`− ${money(s.paidOut)} paid`);

  return (
    <span className="net-prize">
      <b className={paidInFull ? 'ok-text' : ''}>{paidInFull ? `Paid ${money(s.paidOut)} ✓` : `Pay ${money(s.toPay)}`}</b>
      {parts.length > 1 && <small>{parts.join(' ')}</small>}
      {paidInFull && <small>{methods}</small>}
      {s.stillOwes > 0 && <small className="bad-text">still owes {money(s.stillOwes)}</small>}
      {s.overSettled > 0 && <small className="bad-text">{money(s.overSettled)} more than the prize was settled or paid: fix in payments</small>}
      {pending > 0 && (
        <button
          className="btn small"
          title="Record the debt as paid out of this prize"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'settleFromPrize', playerId: p.id });
          }}
        >
          Settle from prize
        </button>
      )}
      {s.toPay > 0 && payoutsAreFinal(t) && (
        <span className="pay-buttons">
          <small>Paid by</small>
          {(['cash', 'interac'] as const).map((method) => (
            <button
              key={method}
              className="btn small"
              title={`Record ${money(s.toPay)} handed over`}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'payPrize', playerId: p.id, method });
              }}
            >
              {method === 'cash' ? 'Cash' : 'Interac'}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function DealDialog({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const players = activePlayers(t);
  const pool = dealPool(t);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const shares = players.map((p) => {
    const raw = (draft[p.id] ?? '').trim();
    return { playerId: p.id, amount: raw === '' ? 0 : Number(raw) };
  });
  const entered = shares.reduce((sum, d) => sum + (Number.isFinite(d.amount) ? d.amount : 0), 0);
  const problem = dealError(t, shares);

  return (
    <Modal title="Make a deal" onClose={onClose}>
      <p className="hint">
        Enter what each player still in takes. This ends the tournament; you can cancel the deal afterwards to resume play.
      </p>
      <div className="stat-row">
        <div className="stat">
          <span>To share</span>
          <b>{money(pool)}</b>
        </div>
        <div className={`stat${entered === pool ? '' : ' bad'}`}>
          <span>Left to give</span>
          <b>{money(pool - entered)}</b>
        </div>
      </div>
      {players.map((p) => (
        <label className="field" key={p.id}>
          <span>{p.name}</span>
          <span className="row">
            <span className="prefix">$</span>
            <input
              className="input num"
              type="number"
              inputMode="numeric"
              aria-label={`Amount for ${p.name}`}
              value={draft[p.id] ?? ''}
              onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
            />
          </span>
        </label>
      ))}
      <div className="row wrap">
        <button
          className="btn grow"
          onClick={() => setDraft(Object.fromEntries(evenDeal(t).map((d) => [d.playerId, String(d.amount)])))}
        >
          Split evenly
        </button>
        <button
          className="btn primary grow"
          disabled={problem !== null}
          onClick={() => {
            dispatch({ type: 'setDeal', shares });
            onClose();
          }}
        >
          Confirm deal
        </button>
      </div>
      {problem && entered > 0 && <p className="error">{problem}</p>}
    </Modal>
  );
}
