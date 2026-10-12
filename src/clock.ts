import { useEffect, useState } from 'react';

/** The current time, refreshed a few times a second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return active ? now : Date.now();
}

export type WakeStatus = 'on' | 'off' | 'refused';

/**
 * Keeps the screen from dimming or locking while `active`. The phone drops the hold whenever the
 * page leaves the screen, so it is asked for again each time the page comes back into view.
 */
export function useWakeLock(active: boolean): WakeStatus {
  const [status, setStatus] = useState<WakeStatus>('off');
  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        if (!('wakeLock' in navigator)) throw new Error('unsupported');
        const held = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void held.release();
          return;
        }
        sentinel = held;
        setStatus('on');
        held.addEventListener('release', () => {
          if (!cancelled) setStatus((s) => (s === 'on' ? 'off' : s));
        });
      } catch {
        // Battery saver, an old iOS home-screen app, or no support at all.
        if (!cancelled) setStatus('refused');
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
  return status;
}

// ---------- sound ----------

let audio: AudioContext | null = null;

/** Browsers only allow sound after a tap: call this from the clock's buttons. */
export function unlockSound(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function beep(at: number, frequency: number, seconds: number): void {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.6, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.05);
}

/** Generated in the browser: no sound file, nothing to download. */
export function playSignal(kind: 'warning' | 'level'): void {
  try {
    if (audio && audio.state === 'running') {
      const t = audio.currentTime;
      if (kind === 'warning') beep(t, 660, 0.25);
      else [0, 0.3, 0.6].forEach((d, i) => beep(t + d, i === 2 ? 1175 : 880, i === 2 ? 0.6 : 0.2));
    }
    // Not supported on iPhones; the sound and the flash still happen.
    navigator.vibrate?.(kind === 'warning' ? 200 : [300, 150, 300]);
  } catch {
    // A phone that refuses sound must never break the clock.
  }
}
