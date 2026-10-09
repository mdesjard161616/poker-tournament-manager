import { useState } from 'react';
import { collected, money, outstanding, owedFromPrizes, playerOwes, playerPaid, playerTotal, prizePool, rebuyCount } from '../logic/logic';
import type { Player, Tournament } from '../logic/types';
import { dispatch } from '../store';

type SortKey = 'name' | 'rebuys' | 'total' | 'paid' | 'owes';

const columns: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'rebuys', label: 'Rebuys' },
  { key: 'total', label: 'Total' },
  { key: 'paid', label: 'Paid' },
  { key: 'owes', label: 'Owes' },
];

function value(p: Player, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return p.name.toLowerCase();
    case 'rebuys':
      return rebuyCount(p);
    case 'total':
      return playerTotal(p);
    case 'paid':
      return playerPaid(p);
    case 'owes':
      return playerOwes(p);
  }
}

export function MoneyScreen({ t, openDetail }: { t: Tournament; openDetail: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const [owesOnly, setOwesOnly] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const byName = (a: Player, b: Player) => a.name.localeCompare(b.name);
  let rows = t.players.filter((p) => (!owesOnly || playerOwes(p) > 0) && (!query || p.name.toLowerCase().includes(query)));
  if (sort) {
    rows = rows.slice().sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      const cmp = va < vb ? -1 : va > vb ? 1 : byName(a, b);
      return sort.desc ? -cmp : cmp;
    });
  } else {
    // Default: players who owe first.
    rows = rows.slice().sort((a, b) => Number(playerOwes(b) > 0) - Number(playerOwes(a) > 0) || byName(a, b));
  }

  const pool = prizePool(t);
  const got = collected(t);
  const fromPrizes = owedFromPrizes(t);
  const sum = (fn: (p: Player) => number) => rows.reduce((a, p) => a + fn(p), 0);

  return (
    <div className="money">
      <div className="stat-row">
        <div className="stat">
          <span>Pool</span>
          <b>{money(pool)}</b>
        </div>
        <div className="stat">
          <span>Collected</span>
          <b>{money(got.total)}</b>
          <small>
            cash {money(got.cash)} · Interac {money(got.interac)}
          </small>
        </div>
        <div className={`stat${outstanding(t) > 0 ? ' bad' : ''}`}>
          <span>Outstanding</span>
          <b>{money(outstanding(t))}</b>
          {fromPrizes > 0 && (
            <small>
              {money(fromPrizes)} comes off prizes · {money(outstanding(t) - fromPrizes)} to collect
            </small>
          )}
        </div>
      </div>

      <div className="toolbar">
        <input className="input search" type="search" placeholder="Find a player" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`btn${owesOnly ? ' active' : ''}`} onClick={() => setOwesOnly(!owesOnly)}>
          Owes only
        </button>
        {sort && (
          <button className="btn" onClick={() => setSort(null)}>
            Owing first
          </button>
        )}
      </div>

      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.key === 'name' ? '' : 'right'}>
                <button
                  className="th-btn"
                  onClick={() => setSort(sort?.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.key !== 'name' })}
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const owes = playerOwes(p);
            return (
              <tr key={p.id} onClick={() => openDetail(p.id)} className="clickable">
                <td>{p.name}</td>
                <td className="right">{rebuyCount(p) || ''}</td>
                <td className="right">{money(playerTotal(p))}</td>
                <td className="right">{money(playerPaid(p))}</td>
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
                    money(0)
                  )}
                </td>
                <td className="right">
                  <button className="btn small">{owes > 0 ? 'Payment' : 'Details'}</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="hint">
                {owesOnly ? 'Nobody owes anything.' : 'No players.'}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Total ({rows.length})</td>
            <td className="right">{sum(rebuyCount)}</td>
            <td className="right">{money(sum(playerTotal))}</td>
            <td className="right">{money(sum(playerPaid))}</td>
            <td className="right">{money(sum(playerOwes))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="hint">Tap an "Owes" badge to mark it paid in cash. Tap a row for partial payments, Interac, or to fix a mistake.</p>
    </div>
  );
}
