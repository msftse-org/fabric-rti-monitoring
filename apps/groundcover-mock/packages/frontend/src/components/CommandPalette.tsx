import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileText, Flag, Home, LayoutGrid, Map as MapIcon, Search, Waypoints, Activity, Server, type LucideIcon } from 'lucide-react';
import { useData } from '../lib/data';
import { DASHBOARDS } from '../lib/dashboards';
import { navigate } from '../lib/router';
import { useEscape } from '../lib/hooks';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const PAGES: Command[] = [
  { id: 'p-workloads', group: 'Pages', label: 'Workloads', icon: Home, run: () => navigate('workloads') },
  { id: 'p-map', group: 'Pages', label: 'Map', icon: MapIcon, run: () => navigate('map') },
  { id: 'p-logs', group: 'Pages', label: 'Logs', icon: FileText, run: () => navigate('logs') },
  { id: 'p-traces', group: 'Pages', label: 'Traces', icon: Waypoints, run: () => navigate('traces') },
  { id: 'p-issues', group: 'Pages', label: 'Issues', icon: Flag, run: () => navigate('issues') },
  { id: 'p-metrics', group: 'Pages', label: 'Metrics (Explore)', icon: Activity, run: () => navigate('metrics') },
  { id: 'p-dashboards', group: 'Pages', label: 'Dashboards', icon: LayoutGrid, run: () => navigate('dashboards') },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { view } = useData();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEscape(onClose, open);

  useEffect(() => {
    if (open) {
      setText('');
      setActive(0);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo(() => {
    const workloads: Command[] = (view?.workloads ?? []).map((workload) => ({
      id: `w-${workload.name}`,
      group: 'Workloads',
      label: workload.name,
      hint: `${workload.kind} · otel-demo`,
      icon: Server,
      run: () => navigate(`workloads/${workload.name}`),
    }));
    const dashboards: Command[] = DASHBOARDS.map((dashboard) => ({
      id: `d-${dashboard.id}`,
      group: 'Dashboards',
      label: dashboard.name,
      icon: LayoutGrid,
      run: () => navigate(`dashboards/${dashboard.id}`),
    }));
    const needle = text.trim().toLowerCase();
    const matches = [...PAGES, ...workloads, ...dashboards].filter((command) => !needle || command.label.toLowerCase().includes(needle));
    if (needle) {
      matches.push({
        id: 'search-logs',
        group: 'Search',
        label: `Search logs for “${text.trim()}”`,
        icon: Search,
        run: () => navigate('logs', { q: text.trim() }),
      });
    }
    return matches;
  }, [view, text]);

  if (!open) return null;

  const choose = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(commands.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(commands[active]);
    }
  };

  let lastGroup = '';
  return (
    <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Navigate">
        <div className="palette__input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            value={text}
            onChange={(event) => { setText(event.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, workload or dashboard…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={commands[active] ? `cmd-${commands[active].id}` : undefined}
            aria-label="Navigate"
          />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" className="palette__list" role="listbox">
          {commands.length === 0 && <li className="palette__empty">No matches</li>}
          {commands.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon;
            return (
              <li key={command.id} role="presentation">
                {heading && <div className="palette__group">{heading}</div>}
                <div
                  id={`cmd-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={`palette__item${index === active ? ' palette__item--active' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(command)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{command.label}</span>
                  {command.hint && <span className="palette__hint">{command.hint}</span>}
                  {index === active && <CornerDownLeft size={13} className="palette__enter" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
