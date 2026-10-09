import { activePlayers, finishingPlace, money, ordinal, playerOwes, settleAmount, settlement } from '../logic/logic';
import type { Tournament } from '../logic/types';
import { dispatch } from '../store';
import { PayoutEditor } from './PayoutEditor';

export function ResultsScreen({ t, onReinstate, openDetail }: { t: Tournament; onReinstate: (id: string) => void; openDetail: (id: string) => void }) {
  const active = activePlayers(t);
  const placed = t.players
    .map((p) => ({ p, place: finishingPlace(t, p.id) }))
    .filter((r): r is { p: (typeof r)['p']; place: number } => r.place !== null)
    .sort((a, b) => a.place - b.place);

  return (
    <div className="results">
      <div className="results-side">
        <PayoutEditor t={t} />
      </div>
      <div className="panel results-main">
        <h3>
          {t.status === 'finished' ? 'Final results' : 'Elimination order'}
          {t.status === 'running' && <span className="hint"> {active.length} still in</span>}
        </h3>
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
            {placed.map(({ p, place }) => {
              const owes = playerOwes(p);
              const s = settlement(t, p);
              const pending = settleAmount(t, p);
              const out = t.eliminationOrder.includes(p.id);
              return (
                <tr key={p.id} className={`clickable${place === 1 ? ' winner' : ''}`} onClick={() => openDetail(p.id)}>
                  <td>{ordinal(place)}</td>
                  <td>{p.name}</td>
                  <td className="right">
                    {(s.prize > 0 || s.settled > 0) &&
                      (s.owes > 0 || s.settled > 0 ? (
                        <span className="net-prize">
                          <b>Pay {money(s.toPay)}</b>
                          <small>
                            prize {money(s.prize)}
                            {s.settled > 0 && ` − ${money(s.settled)} settled`}
                            {pending > 0 && (s.stillOwes > 0 ? ` − ${money(pending)} of ${money(s.owes)} owed` : ` − owes ${money(s.owes)}`)}
                          </small>
                          {s.stillOwes > 0 && <small className="bad-text">still owes {money(s.stillOwes)}</small>}
                          {s.overSettled > 0 && (
                            <small className="bad-text">{money(s.overSettled)} settled is more than the prize: fix in payments</small>
                          )}
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
                        </span>
                      ) : (
                        money(s.prize)
                      ))}
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
                    {out && (
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
            {placed.length === 0 && (
              <tr>
                <td colSpan={5} className="hint">
                  Nobody has been eliminated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {placed.some(({ p }) => settleAmount(t, p) > 0) && (
          <p className="hint">
            "Pay" is the prize less what that player still owes. "Settle from prize" records that debt as paid out of the prize, so they
            drop off the list of people who owe. If they pay you instead, tap their Owes badge and the full prize shows again.
          </p>
        )}
        <p className="hint">Tap a player for their payments, or to reinstate them.</p>
      </div>
    </div>
  );
}
