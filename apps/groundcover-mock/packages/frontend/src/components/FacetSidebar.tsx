import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { formatCount } from '@telemetry';
import type { FacetGroup } from '../lib/facets';
import { useToast } from '../lib/toast';

interface FacetSidebarProps {
  groups: FacetGroup[];
  matched: number;
  noun: string;
  onToggle: (group: FacetGroup, value: string) => void;
  onOnly: (group: FacetGroup, value: string) => void;
}

function Group({ group, onToggle, onOnly }: { group: FacetGroup; onToggle: FacetSidebarProps['onToggle']; onOnly: FacetSidebarProps['onOnly'] }) {
  const [collapsed, setCollapsed] = useState(group.collapsed);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const values = needle ? group.values.filter((entry) => entry.label.toLowerCase().includes(needle)) : group.values;
  return (
    <section className="facet">
      <button type="button" className="facet__head" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
        {collapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
        <span>{group.label}</span>
      </button>
      {!collapsed && (
        <div className="facet__body">
          {group.searchable && group.values.length > 6 && (
            <input className="facet__search" type="search" placeholder={`Search ${group.label.toLowerCase()}`} aria-label={`Search ${group.label}`} value={search} onChange={(event) => setSearch(event.target.value)} />
          )}
          <ul>
            {values.map((entry) => {
              const id = `${group.id}-${entry.value}`;
              return (
                <li key={entry.value} className="facet__row">
                  <input
                    id={id}
                    type="checkbox"
                    checked={group.checked.has(entry.value)}
                    onChange={() => onToggle(group, entry.value)}
                  />
                  <label htmlFor={id} title={entry.label}>
                    {entry.color && <i style={{ background: entry.color }} aria-hidden="true" />}
                    <span>{entry.label}</span>
                  </label>
                  <button type="button" className="facet__only" onClick={() => onOnly(group, entry.value)} aria-label={`Show only ${entry.label}`}>only</button>
                  <span className="facet__count">{formatCount(entry.count)}</span>
                </li>
              );
            })}
            {values.length === 0 && <li className="facet__none">No values</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

export function FacetSidebar({ groups, matched, noun, onToggle, onOnly }: FacetSidebarProps) {
  const [general, setGeneral] = useState(true);
  const toast = useToast();
  return (
    <div className="facets">
      <div className="facets__top">
        <span className="facets__count">{matched.toLocaleString('en-US')} {noun}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label="Add facet" onClick={() => toast()}>
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="facets__general" aria-expanded={general} onClick={() => setGeneral((value) => !value)}>
        {general ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        General
      </button>
      {general && groups.map((group) => <Group key={group.id} group={group} onToggle={onToggle} onOnly={onOnly} />)}
    </div>
  );
}
