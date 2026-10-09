import { useEffect, useState } from 'react';
import {
  deleteChargeError,
  finishingPlace,
  money,
  nameError,
  ordinal,
  paymentError,
  playerOwes,
  playerPaid,
  playerTotal,
} from '../logic/logic';
import type { Tournament } from '../logic/types';
import { dispatch } from '../store';
import { Modal } from './common';

export function PlayerDetail(props: { t: Tournament; playerId: string; onClose: () => void; onReinstate: (id: string) => void }) {
  const { t, playerId, onClose } = props;
  const p = t.players.find((x) => x.id === playerId);
  const owes = p ? playerOwes(p) : 0;
  const [amount, setAmount] = useState(String(owes));
  const [name, setName] = useState(p?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setAmount(String(owes)), [owes]);

  if (!p) return null;
  const place = finishingPlace(t, p.id);

  const pay = (method: 'cash' | 'interac') => {
    const n = Number(amount);
    const problem = amount.trim() === '' ? 'Enter an amount.' : paymentError(p, n);
    setError(problem);
    if (!problem) dispatch({ type: 'addPayment', playerId: p.id, amount: n, method });
  };

  const rename = () => {
    const problem = nameError(t, name, p.id);
    setError(problem);
    if (!problem) dispatch({ type: 'renamePlayer', playerId: p.id, name });
  };

  const deleteCharge = (chargeId: string) => {
    const problem = deleteChargeError(p, chargeId);
    setError(problem);
    if (!problem) dispatch({ type: 'deleteCharge', playerId: p.id, chargeId });
  };

  return (
    <Modal title={p.name + (place ? ` · ${ordinal(place)}` : '')} onClose={onClose}>
      <div className="stat-row">
        <div className="stat">
          <span>Total</span>
          <b>{money(playerTotal(p))}</b>
        </div>
        <div className="stat">
          <span>Paid</span>
          <b>{money(playerPaid(p))}</b>
        </div>
        <div className={`stat${owes > 0 ? ' bad' : ''}`}>
          <span>Owes</span>
          <b>{money(owes)}</b>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {owes > 0 && (
        <div className="panel">
          <h3>Record a payment</h3>
          <div className="row">
            <span className="prefix">$</span>
            <input
              className="input num"
              type="number"
              inputMode="numeric"
              aria-label="Payment amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="btn primary" onClick={() => pay('cash')}>
              Cash
            </button>
            <button className="btn primary" onClick={() => pay('interac')}>
              Interac
            </button>
          </div>
          <p className="hint">Lower the amount for a partial payment.</p>
        </div>
      )}

      <div className="panel">
        <h3>Charges</h3>
        {p.charges.map((c) => (
          <div className="line" key={c.id}>
            <span>{c.kind === 'buyin' ? 'Buy-in' : 'Rebuy'}</span>
            <b>{money(c.amount)}</b>
            {c.kind === 'rebuy' ? (
              <button className="btn small danger" onClick={() => deleteCharge(c.id)}>
                Delete
              </button>
            ) : (
              <span className="hint">cannot be deleted</span>
            )}
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Payments</h3>
        {p.payments.length === 0 && <p className="hint">No payment recorded.</p>}
        {p.payments.map((pay) => (
          <div className="line" key={pay.id}>
            <span>{pay.method === 'cash' ? 'Cash' : pay.method === 'interac' ? 'Interac' : 'From prize'}</span>
            <b>{money(pay.amount)}</b>
            {pay.method !== 'prize' && (
              <button
                className="btn small"
                onClick={() =>
                  dispatch({
                    type: 'setPaymentMethod',
                    playerId: p.id,
                    paymentId: pay.id,
                    method: pay.method === 'cash' ? 'interac' : 'cash',
                  })
                }
              >
                Change to {pay.method === 'cash' ? 'Interac' : 'cash'}
              </button>
            )}
            <button
              className="btn small danger"
              onClick={() => {
                setError(null);
                dispatch({ type: 'deletePayment', playerId: p.id, paymentId: pay.id });
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {(p.prizePaid?.length ?? 0) > 0 && (
        <div className="panel">
          <h3>Prize paid out</h3>
          {p.prizePaid!.map((pay) => (
            <div className="line" key={pay.id}>
              <span>{pay.method === 'cash' ? 'Cash' : 'Interac'}</span>
              <b>{money(pay.amount)}</b>
              <button className="btn small danger" onClick={() => dispatch({ type: 'deletePrizePayment', playerId: p.id, paymentId: pay.id })}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h3>Name</h3>
        <div className="row wrap">
          <input className="input grow" aria-label="Player name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={rename} disabled={name.trim() === p.name}>
            Rename
          </button>
          {!t.deal && t.eliminationOrder.includes(p.id) && (
            <button
              className="btn"
              onClick={() => {
                onClose();
                props.onReinstate(p.id);
              }}
            >
              Reinstate
            </button>
          )}
          {t.status === 'setup' && (
            <button
              className="btn danger"
              onClick={() => {
                dispatch({ type: 'removePlayer', playerId: p.id });
                onClose();
              }}
            >
              Remove player
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
