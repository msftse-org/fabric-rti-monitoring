import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { parseQuery } from '@telemetry';
import { Search, X } from 'lucide-react';
import { serializeQuery } from '../lib/logsModel';
import { useInert } from '../lib/toast';

interface SearchBarProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  keys: string[];
  valuesFor: (key: string) => string[];
  ariaLabel: string;
}

interface Suggestion {
  label: string;
  apply: string;
  commit: boolean;
}

/** `key:value` search with pills while idle and key/value completion while typing. */
export function SearchBar({ value, onCommit, placeholder, keys, valuesFor, ariaLabel }: SearchBarProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const inert = useInert();

  const latest = useRef(draft);
  const editingRef = useRef(false);
  editingRef.current = editing;
  latest.current = draft;

  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const parsed = useMemo(() => parseQuery(value), [value]);
  const token = draft.split(/\s+/).pop() ?? '';
  const lead = draft.slice(0, draft.length - token.length);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!editing) return [];
    const keyed = /^(-?)([\w.@-]+):(.*)$/.exec(token);
    if (keyed) {
      const [, neg, key, rest] = keyed;
      const head = rest.includes(',') ? `${rest.slice(0, rest.lastIndexOf(',') + 1)}` : '';
      const partial = rest.slice(head.length).toLowerCase();
      return valuesFor(key)
        .filter((candidate) => candidate.toLowerCase().startsWith(partial) && candidate.toLowerCase() !== partial)
        .slice(0, 8)
        .map((candidate) => ({ label: candidate, apply: `${lead}${neg}${key}:${head}${candidate} `, commit: true }));
    }
    const bare = token.replace(/^-/, '').toLowerCase();
    if (!bare) return [];
    return keys
      .filter((key) => key.startsWith(bare) && key !== bare)
      .slice(0, 8)
      .map((key) => ({ label: `${key}:`, apply: `${lead}${token.startsWith('-') ? '-' : ''}${key}:`, commit: false }));
  }, [editing, token, lead, keys, valuesFor]);

  const commit = (text: string) => {
    const next = text.trim();
    setActive(-1);
    setEditing(false);
    if (next !== value.trim()) onCommit(next);
    else setDraft(value);
  };

  const choose = (suggestion: Suggestion) => {
    setDraft(suggestion.apply);
    setActive(-1);
    if (suggestion.commit) commit(suggestion.apply);
    else inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + delta + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0 && suggestions[active]) choose(suggestions[active]);
      else commit(draft);
    } else if (event.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  const removeTerm = (index: number) => {
    const terms = parsed.terms.filter((_, i) => i !== index);
    onCommit(serializeQuery({ terms }));
  };

  const showPills = !editing && parsed.terms.length > 0;

  return (
    <div className="searchbar" data-editing={editing}>
      <Search size={14} className="searchbar__icon" aria-hidden="true" />
      {showPills ? (
        <div className="searchbar__pills" onClick={() => setEditing(true)}>
          {parsed.terms.map((term, index) => (
            <span key={index} className="pill" data-negated={term.negated}>
              {term.negated && <span className="pill__neg">−</span>}
              {term.key && <span className="pill__key">{term.key}:</span>}
              <span className="pill__value">{term.values.join(', ')}</span>
              <button
                type="button"
                className="pill__x"
                aria-label={`Remove ${term.key ? `${term.key}:` : ''}${term.values.join(',')}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeTerm(index);
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button type="button" className="searchbar__edit" aria-label={`Edit ${ariaLabel}`} onFocus={() => setEditing(true)} />
        </div>
      ) : (
        <input
          ref={inputRef}
          className="searchbar__input mono"
          value={draft}
          placeholder={placeholder}
          aria-label={ariaLabel}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            setActive(-1);
          }}
          onFocus={() => setEditing(true)}
          onBlur={() => window.setTimeout(() => editingRef.current && commit(latest.current), 120)}
          onKeyDown={onKeyDown}
        />
      )}
      {value && (
        <button type="button" className="icon-btn searchbar__clear" aria-label="Clear search" onClick={() => { setDraft(''); onCommit(''); }}>
          <X size={14} />
        </button>
      )}
      <button type="button" className="icon-btn searchbar__code" aria-label="Switch to query editor" title="Query editor" onClick={inert}>
        {'</>'}
      </button>
      {suggestions.length > 0 && (
        <ul className="menu searchbar__menu" role="listbox" aria-label="Suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.label} role="option" aria-selected={index === active}>
              <button type="button" className="menu__item mono" data-active={index === active} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}>
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
