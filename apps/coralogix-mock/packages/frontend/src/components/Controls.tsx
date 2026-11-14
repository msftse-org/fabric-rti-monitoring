import type { ReactNode } from 'react';

interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={option.id === value ? 'is-active' : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden />
    </label>
  );
}
