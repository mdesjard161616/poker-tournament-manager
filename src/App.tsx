import { useEffect, useRef, useState } from 'react';
import { MoneyScreen } from './components/MoneyScreen';
import { PlayerDetail } from './components/PlayerDetail';
import { ResultsScreen } from './components/ResultsScreen';
import { RunScreen } from './components/RunScreen';
import { SettingsMenu } from './components/SettingsMenu';
import { SetupScreen } from './components/SetupScreen';
import { Modal } from './components/common';
import { activePlayers } from './logic/logic';
import type { Status, Tournament } from './logic/types';
import { dispatch, getSaveError, useAppState } from './store';
import { VERSION } from './version';

type Screen = 'setup' | 'run' | 'money' | 'results';

const screens: { key: Screen; label: string }[] = [
  { key: 'setup', label: 'Setup' },
  { key: 'run', label: 'Run' },
  { key: 'money', label: 'Money' },
  { key: 'results', label: 'Results' },
];

/** The newer version number once the server has one, checked at start, on return to the app and every 10 minutes. */
function useNewVersion(): string | null {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || location.protocol === 'file:') return;
    let stopped = false;
    const check = () => {
      fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (!stopped && info && typeof info.version === 'string' && info.version !== VERSION) setLatest(info.version);
        })
        .catch(() => undefined); // offline: try again later
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 10 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return latest;
}

function homeScreen(status: Status): Screen {
  return status === 'setup' ? 'setup' : status === 'finished' ? 'results' : 'run';
}

export default function App() {
  const state = useAppState();
  const t = state.tournament;
  const [screen, setScreen] = useState<Screen>(() => homeScreen(t.status));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [seatingList, setSeatingList] = useState(false);
  const [settings, setSettings] = useState(false);

  // Follow the tournament: Start opens Run, the last elimination opens Results, a new tournament opens Setup.
  const lastStatus = useRef(t.status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = t.status;
    if (prev === t.status) return;
    if (t.status === 'finished' || t.status === 'setup' || prev === 'setup') setScreen(homeScreen(t.status));
  }, [t.status]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  // Back in the tray and already selected: the next tap on an open seat places them.
  const reinstate = (id: string) => {
    dispatch({ type: 'reinstate', playerId: id });
    setSelectedId(id);
    setScreen('run');
  };

  const selected = selectedId && activePlayers(t).some((p) => p.id === selectedId) ? selectedId : null;
  const saveError = getSaveError();
  const newVersion = useNewVersion();

  return (
    <div className="app">
      <nav className="nav">
        <span className="title">{t.name || 'Tournament'}</span>
        <span className="version">v{VERSION}</span>
        <div className="tabs">
          {screens.map((s) => (
            <button key={s.key} className={`tab${screen === s.key ? ' active' : ''}`} onClick={() => setScreen(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        <span className={`pill status-${t.status}`}>{t.status === 'setup' ? 'Setup' : t.status === 'running' ? 'Running' : 'Finished'}</span>
        <button className="btn" onClick={() => setSettings(true)}>
          Settings
        </button>
      </nav>
      {saveError && <div className="banner break">{saveError}</div>}
      {newVersion && (
        <div className="banner update">
          <span className="grow">Version {newVersion} is available. Your tournament is saved and stays as it is.</span>
          <button className="btn small primary" onClick={() => location.reload()}>
            Update now
          </button>
        </div>
      )}

      <main>
        {screen === 'setup' && (
          <SetupScreen
            t={t}
            selectedId={selected}
            setSelectedId={setSelectedId}
            openDetail={setDetailId}
            openSeatingList={() => setSeatingList(true)}
          />
        )}
        {screen === 'run' && (
          <RunScreen
            t={t}
            canUndo={state.undoStack.length > 0}
            selectedId={selected}
            setSelectedId={setSelectedId}
            openDetail={setDetailId}
            openSeatingList={() => setSeatingList(true)}
            goTo={setScreen}
          />
        )}
        {screen === 'money' && <MoneyScreen t={t} openDetail={setDetailId} />}
        {screen === 'results' && (
          <ResultsScreen
            t={t}
            openDetail={setDetailId}
            onReinstate={reinstate}
          />
        )}
      </main>

      {detailId && <PlayerDetail t={t} playerId={detailId} onClose={() => setDetailId(null)} onReinstate={reinstate} />}
      {seatingList && <SeatingList t={t} onClose={() => setSeatingList(false)} />}
      {settings && <SettingsMenu state={state} onClose={() => setSettings(false)} />}
    </div>
  );
}

function SeatingList({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const rows = activePlayers(t)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal title="Seating list" onClose={onClose} wide>
      <table className="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Table</th>
            <th>Seat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.seat ? t.tables.find((tb) => tb.id === p.seat!.tableId)?.number : '—'}</td>
              <td>{p.seat ? p.seat.seat : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
