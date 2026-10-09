import type { ReactNode } from 'react';
import { money, occupantOf, playerOwes, rebuyCount, tableCounts, type TableCount } from '../logic/logic';
import type { Player, Tournament } from '../logic/types';

interface Props {
  t: Tournament;
  /** Player being placed or moved; open seats light up while set. */
  selectedId: string | null;
  /** Players matching the search box. */
  highlight: Set<string> | null;
  onSeat: (tableId: string, seat: number, occupant: Player | null) => void;
  onMarkPaid: (playerId: string) => void;
  tableAction?: (table: TableCount) => ReactNode;
}

export function TableGrid({ t, selectedId, highlight, onSeat, onMarkPaid, tableAction }: Props) {
  const seats = Array.from({ length: t.seatsPerTable }, (_, i) => i + 1);
  return (
    <div className="tables">
      {tableCounts(t).map((table) => (
        <section className="table-card" key={table.tableId}>
          <header>
            <strong>Table {table.number}</strong>
            <span className="count">
              {table.count} / {t.seatsPerTable}
            </span>
            {tableAction?.(table)}
          </header>
          {seats.map((seat) => {
            const p = occupantOf(t, table.tableId, seat);
            const owes = p ? playerOwes(p) : 0;
            const rebuys = p ? rebuyCount(p) : 0;
            const classes = ['seat'];
            if (!p) classes.push('empty');
            if (!p && selectedId) classes.push('target');
            if (p && p.id === selectedId) classes.push('selected');
            if (p && highlight?.has(p.id)) classes.push('found');
            return (
              <div
                key={seat}
                className={classes.join(' ')}
                role="button"
                tabIndex={0}
                onClick={() => onSeat(table.tableId, seat, p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSeat(table.tableId, seat, p);
                }}
              >
                <span className="seat-no">{seat}</span>
                <span className="seat-name">{p ? p.name : selectedId ? 'place here' : ''}</span>
                {rebuys > 0 && <span className="chip" title="Rebuys">R{rebuys}</span>}
                {p && owes > 0 && (
                  <button
                    className="owes"
                    title="Mark paid in cash"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkPaid(p.id);
                    }}
                  >
                    Owes {money(owes)}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
