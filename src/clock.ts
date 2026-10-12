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

/**
 * Browsers only allow sound after a tap, and iPhones add two rules of their own: sound made this
 * way is muted by the ring/silent switch unless the page declares itself as playback, and the
 * sound system is put to sleep whenever the app leaves the screen. Safe to call on every tap.
 */
export function unlockSound(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
    const created = audio === null;
    audio ??= new AudioContext();
    if (audio.state !== 'running') void audio.resume().catch(() => undefined);
    if (created) {
      // An inaudible blip inside the tap itself: older iPhones only unlock once something has played.
      const source = audio.createBufferSource();
      source.buffer = audio.createBuffer(1, 1, 22050);
      source.connect(audio.destination);
      source.start(0);
    }
  } catch {
    audio = null;
  }
}

/** Unlocks on the first tap anywhere, and again after each return to the app. */
export function installSoundUnlock(): () => void {
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  events.forEach((e) => document.addEventListener(e, unlockSound, { passive: true }));
  const onVisible = () => {
    if (document.visibilityState === 'visible' && audio && audio.state !== 'running') void audio.resume().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    events.forEach((e) => document.removeEventListener(e, unlockSound));
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function beep(at: number, frequency: number, seconds: number): void {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'square'; // carries further across a room than a pure tone
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.05);
}

function schedule(kind: 'warning' | 'level'): void {
  if (!audio) return;
  const t = audio.currentTime + 0.05;
  if (kind === 'warning') beep(t, 660, 0.3);
  else [0, 0.35, 0.7].forEach((d, i) => beep(t + d, i === 2 ? 1175 : 880, i === 2 ? 0.7 : 0.25));
}

/**
 * Generated in the browser: no sound file, nothing to download. Returns false when the phone
 * has not allowed sound yet, which the Test sound button reports.
 */
export function playSignal(kind: 'warning' | 'level'): boolean {
  let played = false;
  try {
    if (audio) {
      if (audio.state === 'running') {
        schedule(kind);
        played = true;
      } else {
        // Asleep after a spell in the background: wake it, then play.
        void audio.resume().then(() => schedule(kind)).catch(() => undefined);
      }
    }
    // Not supported on iPhones; the sound and the flash still happen.
    navigator.vibrate?.(kind === 'warning' ? 200 : [300, 150, 300]);
  } catch {
    // A phone that refuses sound must never break the clock.
  }
  return played;
}
