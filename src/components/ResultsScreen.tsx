import { activePlayers, computePayouts, effectivePayoutPercents, finishingPlace, money, ordinal, playerOwes, prizePool } from '../logic/logic';
import type { Tournament } from '../logic/types';
import { dispatch } from '../store';
import { PayoutEditor } from './PayoutEditor';

export function ResultsScreen({ t, onReinstate, openDetail }: { t: Tournament; onReinstate: (id: string) => void; openDetail: (id: string) => void }) {
  const payouts = computePayouts(prizePool(t), effectivePayoutPercents(t), t.payoutRounding);
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
              <th className="right">Payout</th>
              <th className="right">Owes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {placed.map(({ p, place }) => {
              const owes = playerOwes(p);
              const out = t.eliminationOrder.includes(p.id);
              return (
                <tr key={p.id} className={`clickable${place === 1 ? ' winner' : ''}`} onClick={() => openDetail(p.id)}>
                  <td>{ordinal(place)}</td>
                  <td>{p.name}</td>
                  <td className="right">{place <= payouts.length ? money(payouts[place - 1]) : ''}</td>
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
      </div>
    </div>
  );
}
