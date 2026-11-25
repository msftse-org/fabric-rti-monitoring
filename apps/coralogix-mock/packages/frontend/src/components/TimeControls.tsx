import { ChevronLeft, ChevronRight, EllipsisVertical, RefreshCw, Undo2 } from 'lucide-react';
import { DEFAULT_MINUTES, TIME_OPTIONS, useDataState } from '../lib/data';
import { useToast } from '../lib/toast';
import { DropdownMenu } from './DropdownMenu';

/** Reset, refresh, `‹ Last 15 minutes ›` and the overflow menu that every Coralogix page header carries. */
export function TimeControls() {
  const { minutes, setMinutes, telemetry } = useDataState();
  const { notify } = useToast();
  const index = Math.max(0, TIME_OPTIONS.findIndex((option) => option.minutes === minutes));
  const current = TIME_OPTIONS[index];

  return (
    <div className="time-controls">
      <button type="button" className="icon-btn" aria-label="Reset time range" onClick={() => setMinutes(DEFAULT_MINUTES)}>
        <Undo2 size={15} />
      </button>
      <button type="button" className="icon-btn icon-btn--accent" aria-label="Refresh data" disabled={telemetry.loading} onClick={telemetry.refresh}>
        <RefreshCw size={15} className={telemetry.loading ? 'spin' : undefined} />
      </button>
      <div className="time-pill">
        <button type="button" aria-label="Shorter time range" disabled={index === 0} onClick={() => setMinutes(TIME_OPTIONS[index - 1].minutes)}>
          <ChevronLeft size={13} />
        </button>
        <DropdownMenu
          ariaLabel={`Time range: ${current.label}`}
          triggerClassName="time-pill-label"
          trigger={current.label}
          align="right"
          items={TIME_OPTIONS.map((option) => ({
            id: String(option.minutes),
            label: option.label,
            selected: option.minutes === minutes,
            onSelect: () => setMinutes(option.minutes),
          }))}
        />
        <button type="button" aria-label="Longer time range" disabled={index === TIME_OPTIONS.length - 1} onClick={() => setMinutes(TIME_OPTIONS[index + 1].minutes)}>
          <ChevronRight size={13} />
        </button>
      </div>
      <DropdownMenu
        ariaLabel="More options"
        triggerClassName="icon-btn"
        trigger={<EllipsisVertical size={15} />}
        align="right"
        items={[
          {
            id: 'copy',
            label: 'Copy URL',
            onSelect: () => {
              void navigator.clipboard?.writeText(window.location.href).then(() => notify('Link copied to clipboard'));
            },
          },
          { id: 'reset', label: 'Reset time range', onSelect: () => setMinutes(DEFAULT_MINUTES) },
        ]}
      />
    </div>
  );
}
