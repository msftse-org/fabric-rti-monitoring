import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

export interface FacetGroupData {
  key: string;
  label: string;
  counts: Map<string, number>;
  include: string[];
  exclude: string[];
  swatch?: (value: string) => ReactNode;
}

interface Props {
  groups: FacetGroupData[];
  onToggle: (key: string, value: string) => void;
}

const COLLAPSED_LIMIT = 8;

export function Facets({ groups, onToggle }: Props) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => groups.filter((group) => group.label.toLowerCase().includes(filter.trim().toLowerCase())), [groups, filter]);
  return (
    <div className="facets">
      <div className="input-wrap facets__search">
        <Search size={13} />
        <input className="input" placeholder="Search facets" aria-label="Search facets" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </div>
      {visible.map((group) => (
        <FacetGroup key={group.key} group={group} onToggle={onToggle} />
      ))}
      {!visible.length && <div className="facets__empty muted">No facets match “{filter}”.</div>}
    </div>
  );
}

function FacetGroup({ group, onToggle }: { group: FacetGroupData; onToggle: Props['onToggle'] }) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const entries = useMemo(() => {
    const merged = new Map(group.counts);
    for (const value of [...group.include, ...group.exclude]) {
      if (![...merged.keys()].some((key) => key.toLowerCase() === value)) merged.set(value, 0);
    }
    return [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [group]);
  const shown = all ? entries : entries.slice(0, COLLAPSED_LIMIT);
  const max = Math.max(1, ...entries.map(([, count]) => count));

  return (
    <section className="facet">
      <button type="button" className="facet__head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{group.label}</span>
      </button>
      {open && (
        <ul className="facet__list">
          {shown.map(([value, count]) => {
            const lower = value.toLowerCase();
            const checked = group.include.includes(lower);
            const excluded = group.exclude.includes(lower);
            return (
              <li key={value}>
                <label className="facet__row" data-excluded={excluded}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(group.key, value)} aria-label={`${group.label} ${value}`} />
                  {group.swatch?.(value)}
                  <span className="facet__value truncate" title={value}>
                    {value}
                  </span>
                  <span className="facet__count">
                    <span className="facet__bar" style={{ width: `${(count / max) * 100}%` }} aria-hidden="true" />
                    {count.toLocaleString()}
                  </span>
                </label>
              </li>
            );
          })}
          {entries.length > COLLAPSED_LIMIT && (
            <li>
              <button type="button" className="link-btn facet__more" onClick={() => setAll((value) => !value)}>
                {all ? 'Show less' : `Show all ${entries.length}`}
              </button>
            </li>
          )}
          {!entries.length && <li className="facet__none muted">No values</li>}
        </ul>
      )}
    </section>
  );
}
