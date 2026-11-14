import { Play, Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface QueryBarProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  error: string | null;
  placeholder: string;
  ariaLabel: string;
  /** Controls rendered left of the input (dataset, severity, ...). */
  leading?: ReactNode;
}

export function QueryBar({ value, onChange, onRun, error, placeholder, ariaLabel, leading }: QueryBarProps) {
  return (
    <form
      className="query-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <div className="query-row">
        {leading}
        <label className={`query-box${error ? ' has-error' : ''}`}>
          <Search size={14} aria-hidden />
          <input
            className="query-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
      <div className="query-actions">
        {error && (
          <span className="query-error" role="alert">
            {error}
          </span>
        )}
        <button type="submit" className="btn-run">
          <Play size={12} fill="currentColor" aria-hidden />
          Run
        </button>
      </div>
    </form>
  );
}
