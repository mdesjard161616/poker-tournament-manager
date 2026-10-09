import { useEffect, useState } from 'react';
import {
  ROUNDING_CHOICES,
  computePayouts,
  defaultPayoutPercents,
  effectivePayoutPercents,
  holdbackAmount,
  holdbackLabel,
  money,
  ordinal,
  payoutPercentsError,
  payoutPool,
  payoutsAreFinal,
  prizePool,
} from '../logic/logic';
import type { Tournament } from '../logic/types';
import { dispatch } from '../store';

export function PayoutEditor({ t }: { t: Tournament }) {
  const percents = effectivePayoutPercents(t);
  const auto = t.payoutPercents.length === 0;
  const key = percents.join('/');
  const [draft, setDraft] = useState<string[]>(percents.map(String));
  useEffect(() => setDraft(key.split('/')), [key]);

  const pool = payoutPool(t);
  const aside = holdbackAmount(t);
  const payouts = computePayouts(pool, percents, t.payoutRounding);
  const numbers = draft.map((d) => (d.trim() === '' ? NaN : Number(d)));
  const dirty = draft.join('/') !== key;
  const problem = dirty ? payoutPercentsError(numbers) : null;

  return (
    <div className="panel">
      <h3>
        Payouts <span className={`pill ${payoutsAreFinal(t) ? 'ok' : 'warn'}`}>{payoutsAreFinal(t) ? 'final' : 'provisional'}</span>
        {auto && <span className="hint"> default for {t.players.length} players, set at Start</span>}
      </h3>
      <table className="grid compact">
        <thead>
          <tr>
            <th>Place</th>
            <th>%</th>
            <th className="right">Payout</th>
          </tr>
        </thead>
        <tbody>
          {draft.map((d, i) => (
            <tr key={i}>
              <td>{ordinal(i + 1)}</td>
              <td>
                <input
                  className="input num"
                  type="number"
                  inputMode="decimal"
                  aria-label={`${ordinal(i + 1)} place percentage`}
                  value={d}
                  onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </td>
              <td className="right">{dirty ? '…' : money(payouts[i] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row wrap">
        <button className="btn small" onClick={() => setDraft([...draft, ''])} disabled={draft.length >= 10}>
          Add place
        </button>
        <button className="btn small" onClick={() => setDraft(draft.slice(0, -1))} disabled={draft.length <= 1}>
          Remove last
        </button>
        <button
          className="btn small"
          disabled={!dirty && key === defaultPayoutPercents(t.players.length).join('/')}
          onClick={() => {
            dispatch({ type: 'setPayoutPercents', percents: [] });
            setDraft(defaultPayoutPercents(t.players.length).map(String));
          }}
        >
          Use default
        </button>
        <button
          className="btn small primary"
          disabled={!dirty || problem !== null}
          onClick={() => dispatch({ type: 'setPayoutPercents', percents: numbers })}
        >
          Apply
        </button>
      </div>
      {problem && <p className="error">{problem}</p>}
      <div className="row">
        <span>Round to</span>
        {ROUNDING_CHOICES.map((u) => (
          <button
            key={u}
            className={`btn small${t.payoutRounding === u ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'setPayoutRounding', rounding: u })}
          >
            ${u}
          </button>
        ))}
      </div>
      <p className="hint">
        {aside > 0
          ? `Pool ${money(prizePool(t))} − ${money(aside)} (${t.holdback!.percent}%) for ${holdbackLabel(t)} = ${money(pool)} in prizes.`
          : `Pool ${money(pool)}.`}{' '}
        1st takes what is left after the other places are rounded.
      </p>
    </div>
  );
}
