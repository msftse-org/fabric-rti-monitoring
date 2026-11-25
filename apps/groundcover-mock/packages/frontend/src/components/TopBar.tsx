import { Calendar, Check, ChevronDown, Globe, GitBranch, Menu, RefreshCw } from 'lucide-react';
import { TelemetryStatus } from '@telemetry';
import { TIME_OPTIONS, timeLabel, useData } from '../lib/data';
import { useToast } from '../lib/toast';
import { Popover } from './Popover';

function ScopeChip({ icon, label, value }: { icon: 'cluster' | 'environment'; label: string; value: string }) {
  const Icon = icon === 'cluster' ? GitBranch : Globe;
  return (
    <Popover
      buttonClassName="chip-btn"
      button={
        <>
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
          <strong>1/1</strong>
        </>
      }
      panelClassName="scope-panel"
    >
      {() => (
        <div role="group" aria-label={label}>
          <div className="scope-panel__title">{label}</div>
          <label className="scope-panel__row">
            <input type="checkbox" checked readOnly aria-label={`${value} (only ${label.toLowerCase().slice(0, -1)} in this mock)`} />
            <span>{value}</span>
          </label>
        </div>
      )}
    </Popover>
  );
}

function TimePicker() {
  const { minutes, setMinutes } = useData();
  return (
    <Popover
      buttonClassName="chip-btn chip-btn--time"
      align="right"
      button={
        <>
          <Calendar size={14} aria-hidden="true" />
          <span>{timeLabel(minutes)}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
      panelClassName="time-panel"
    >
      {(close) => (
        <div role="listbox" aria-label="Time range">
          {TIME_OPTIONS.map((option) => (
            <button
              key={option.minutes}
              type="button"
              role="option"
              aria-selected={option.minutes === minutes}
              className="menu-option"
              onClick={() => { setMinutes(option.minutes); close(); }}
            >
              <span>{option.label}</span>
              {option.minutes === minutes && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
          <div className="menu-hint">Relative to the newest record · times in UTC</div>
        </div>
      )}
    </Popover>
  );
}

function DataIndicator() {
  const { telemetry } = useData();
  return <TelemetryStatus telemetry={telemetry} />;
}

interface TopBarProps {
  title: string;
  showCreateMonitor: boolean;
  onOpenMenu: () => void;
}

export function TopBar({ title, showCreateMonitor, onOpenMenu }: TopBarProps) {
  const toast = useToast();
  const { telemetry, view } = useData();
  const env = view?.bundle.environment;

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu size={18} aria-hidden="true" />
      </button>
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__spacer" />
      <div className="topbar__tools">
        {env && <ScopeChip icon="cluster" label="Clusters" value={env.cluster} />}
        {env && <ScopeChip icon="environment" label="Environments" value={env.environment} />}
        <TimePicker />
        <DataIndicator />
        <button type="button" className="icon-btn" disabled={telemetry.loading} onClick={telemetry.refresh} aria-label="Refresh data" title="Refresh">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
        {showCreateMonitor && (
          <button type="button" className="btn btn--primary topbar__create" onClick={() => toast()}>Create Monitor</button>
        )}
      </div>
    </header>
  );
}
