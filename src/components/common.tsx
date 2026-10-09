import { useEffect, useState, type ReactNode } from 'react';

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className={`modal${props.wide ? ' wide' : ''}`} role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="btn ghost" onClick={props.onClose} aria-label="Close">
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/** Whole-number field that commits on blur or Enter and snaps back when the value is not accepted. */
export function NumInput(props: {
  value: number;
  min: number;
  max?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = () => {
    const n = Number(draft);
    const ok = draft.trim() !== '' && Number.isInteger(n) && n >= props.min && (props.max === undefined || n <= props.max);
    if (ok && n !== props.value) props.onCommit(n);
    else setDraft(String(props.value));
  };
  return (
    <input
      className="input num"
      type="number"
      inputMode="numeric"
      aria-label={props.label}
      value={draft}
      min={props.min}
      max={props.max}
      disabled={props.disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Toggle(props: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}
