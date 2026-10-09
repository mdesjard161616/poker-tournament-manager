import { useRef, useState } from 'react';
import { money, outstanding } from '../logic/logic';
import { parseAppState, serializeState } from '../logic/storage';
import type { AppState } from '../logic/types';
import { dispatch, todayString } from '../store';
import { VERSION } from '../version';
import { Modal, Toggle } from './common';

declare const __BUILD__: string;

export function SettingsMenu({ state, onClose }: { state: AppState; onClose: () => void }) {
  const t = state.tournament;
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const owed = outstanding(t);

  const exportFile = () => {
    const blob = new Blob([serializeState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.name.trim().replace(/[^\w-]+/g, '-') || 'tournament'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    let parsed: AppState | null = null;
    try {
      parsed = parseAppState(JSON.parse(await file.text()));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      setMessage(`"${file.name}" is not a tournament backup. Nothing was changed.`);
      return;
    }
    if (t.players.length > 0 && !window.confirm(`Replace the current tournament with "${parsed.tournament.name}"?`)) return;
    dispatch({ type: 'import', state: parsed });
    onClose();
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="panel">
        <Toggle label="Rebuys allowed" checked={t.rebuysAllowed} onChange={(value) => dispatch({ type: 'setRebuysAllowed', value })} />
        <Toggle label="Late registration open" checked={t.lateRegOpen} onChange={(value) => dispatch({ type: 'setLateRegOpen', value })} />
      </div>
      <div className="panel">
        <h3>Backup</h3>
        <div className="row wrap">
          <button className="btn grow" onClick={exportFile}>
            Export
          </button>
          <button className="btn grow" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>
        {message && <p className="error">{message}</p>}
      </div>
      <div className="panel">
        <h3>New tournament</h3>
        {!confirming ? (
          <button className="btn danger" onClick={() => setConfirming(true)}>
            New tournament…
          </button>
        ) : (
          <>
            <p>
              This clears every player, seat, charge and payment.
              {owed > 0 && (
                <b className="bad-text">
                  {' '}
                  {money(owed)} is still outstanding and that list will be lost.
                </b>
              )}{' '}
              Type <b>NEW</b> to confirm.
            </p>
            <div className="row">
              <input className="input grow" autoFocus aria-label="Type NEW to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button
                className="btn danger"
                disabled={typed.trim().toUpperCase() !== 'NEW'}
                onClick={() => {
                  dispatch({ type: 'newTournament', today: todayString() });
                  onClose();
                }}
              >
                Clear everything
              </button>
            </div>
          </>
        )}
      </div>
      <p className="hint">
        Version {VERSION}, built {__BUILD__}. To update, close the app completely and open it again while online.
      </p>
    </Modal>
  );
}
