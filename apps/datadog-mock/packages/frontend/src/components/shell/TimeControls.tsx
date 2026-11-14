import { Clock, ChevronDown, Pause, Play, RefreshCw, Rewind, FastForward, ZoomOut, Check } from 'lucide-react';
import { TIME_PRESETS, useShell, useTime } from '../../lib/app';
import { formatClockMs } from '../../lib/time';
import { Dropdown } from '../Select';

export function TimeControls() {
  const time = useTime();
  const { source, data } = useShell();
  const range = data ? `${formatClockMs(data.since, false)} – ${formatClockMs(data.until, false)} UTC` : '';
  return (
    <div className="timebar">
      <Dropdown
        label={`Time range: ${time.label}`}
        align="right"
        triggerClassName="timepick"
        trigger={
          <>
            <Clock size={14} />
            <span className="timepick__label">{time.label}</span>
            <span className="timepick__short">{time.short}</span>
            <ChevronDown size={14} />
          </>
        }
      >
        {(close) => (
          <>
            <div className="menu__caption">{range || 'Time range'}</div>
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                role="menuitemradio"
                aria-checked={preset.minutes === time.minutes}
                className="menu__item"
                onClick={() => {
                  time.setMinutes(preset.minutes);
                  close();
                }}
              >
                <span className="grow">{preset.label}</span>
                {preset.minutes === time.minutes && <Check size={14} />}
              </button>
            ))}
          </>
        )}
      </Dropdown>
      <div className="btn-group timebar__cluster" role="group" aria-label="Time controls">
        <button type="button" className="btn btn--icon" aria-label="Step back one window" title="Step back" disabled={!time.canStepBack} onClick={time.stepBack}>
          <Rewind size={14} />
        </button>
        <button type="button" className="btn btn--icon" aria-label={time.paused ? 'Resume live updates' : 'Pause live updates'} title={time.paused ? 'Resume' : 'Pause'} aria-pressed={time.paused} onClick={time.togglePaused}>
          {time.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button type="button" className="btn btn--icon" aria-label="Step forward one window" title="Step forward" disabled={time.shift === 0} onClick={time.stepForward}>
          <FastForward size={14} />
        </button>
        <button type="button" className="btn btn--icon" aria-label="Zoom out" title="Zoom out" disabled={time.minutes >= 60} onClick={time.zoomOut}>
          <ZoomOut size={14} />
        </button>
      </div>
      <button type="button" className="btn btn--icon timebar__refresh" aria-label="Refresh data" title="Refresh" disabled={source.loading} onClick={source.refresh}>
        <RefreshCw size={14} className={source.loading ? 'spin' : undefined} />
      </button>
    </div>
  );
}
