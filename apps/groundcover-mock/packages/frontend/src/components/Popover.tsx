import { useId, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../lib/hooks';

interface PopoverProps {
  button: ReactNode;
  buttonClassName?: string;
  buttonLabel?: string;
  panelClassName?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode;
}

/** A button that toggles a dismissible panel (Esc and outside press close it). */
export function Popover({ button, buttonClassName = 'chip-btn', buttonLabel, panelClassName = '', align = 'left', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useDismiss(root, () => setOpen(false), open);

  return (
    <div className="popover" ref={root}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {button}
      </button>
      {open && (
        <div id={panelId} className={`popover__panel popover__panel--${align} ${panelClassName}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
