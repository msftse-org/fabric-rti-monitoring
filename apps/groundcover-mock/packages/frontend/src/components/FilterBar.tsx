import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { quoteValue, tokenize } from '../lib/facets';
import { isTypingTarget } from '../lib/hooks';

export interface SuggestField {
  key: string;
  values: string[];
}

interface FilterBarProps {
  tokens: string[];
  onChange: (tokens: string[]) => void;
  fields: SuggestField[];
  placeholder: string;
  label: string;
  actions?: ReactNode;
}

interface Suggestion {
  id: string;
  label: string;
  hint?: string;
  apply: () => void;
}

function describe(token: string): { negated: boolean; key: string | null; value: string } {
  const match = /^(-?)(?:([A-Za-z_][\w.@-]*):)?(.*)$/s.exec(token);
  return { negated: match?.[1] === '-', key: match?.[2] ?? null, value: (match?.[3] ?? token).replace(/^"|"$/g, '') };
}

export function FilterBar({ tokens, onChange, fields, placeholder, label, actions }: FilterBarProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const commit = (value: string) => {
    const added = tokenize(value);
    if (added.length) onChange([...tokens, ...added.filter((token) => !tokens.includes(token))]);
    setText('');
    setActive(-1);
  };

  const suggestions: Suggestion[] = (() => {
    const negated = text.startsWith('-');
    const body = negated ? text.slice(1) : text;
    const colon = body.indexOf(':');
    if (colon >= 0) {
      const key = body.slice(0, colon).toLowerCase();
      const partial = body.slice(colon + 1).toLowerCase().replace(/^"/, '');
      const field = fields.find((item) => item.key === key);
      return (field?.values ?? [])
        .filter((value) => value.toLowerCase().includes(partial))
        .slice(0, 12)
        .map((value) => ({
          id: `${key}:${value}`,
          label: value,
          hint: key,
          apply: () => commit(`${negated ? '-' : ''}${field?.key ?? key}:${quoteValue(value)}`),
        }));
    }
    return fields
      .filter((field) => field.key.includes(body.toLowerCase()))
      .map((field) => ({
        id: field.key,
        label: field.key,
        hint: `${field.values.length} values`,
        apply: () => {
          setText(`${negated ? '-' : ''}${field.key}:`);
          input.current?.focus();
        },
      }));
  })();

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(-1, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0 && suggestions[active]) suggestions[active].apply();
      else commit(text);
    } else if (event.key === 'Backspace' && text === '' && tokens.length) {
      onChange(tokens.slice(0, -1));
    } else if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation();
        setOpen(false);
      } else {
        input.current?.blur();
      }
    }
  };

  return (
    <div className="filterbar">
      <div className="filterbar__box" ref={root} onClick={() => input.current?.focus()}>
        <Search size={14} aria-hidden="true" className="filterbar__icon" />
        {tokens.map((token) => {
          const chip = describe(token);
          return (
            <span key={token} className={`fchip${chip.negated ? ' fchip--neg' : ''}`}>
              {chip.key && <b>{chip.key}</b>}
              {chip.key && <span className="fchip__op">{chip.negated ? '≠' : ':'}</span>}
              <span>{chip.value}</span>
              <button type="button" aria-label={`Remove filter ${token}`} onClick={(event) => { event.stopPropagation(); onChange(tokens.filter((other) => other !== token)); }}>
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          className="filterbar__input"
          value={text}
          placeholder={tokens.length ? '' : placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        {tokens.length > 0 && (
          <button type="button" className="filterbar__clear" aria-label="Clear all filters" onClick={(event) => { event.stopPropagation(); onChange([]); }}>
            <X size={13} aria-hidden="true" />
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul className="suggest" id={listId} role="listbox">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`suggest__item${index === active ? ' suggest__item--active' : ''}`}
                onMouseDown={(event) => { event.preventDefault(); suggestion.apply(); }}
                onMouseMove={() => setActive(index)}
              >
                <span>{suggestion.label}</span>
                {suggestion.hint && <small>{suggestion.hint}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {actions && <div className="filterbar__actions">{actions}</div>}
    </div>
  );
}
