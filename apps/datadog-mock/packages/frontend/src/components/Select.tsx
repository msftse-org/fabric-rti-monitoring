import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useDismiss } from '../lib/hooks';

interface DropdownProps {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  triggerClassName?: string;
  menuClassName?: string;
}

/** Button + popover. Closes on outside press and Escape, and returns focus to the trigger. */
export function Dropdown({ label, trigger, children, align = 'left', triggerClassName = 'select__trigger', menuClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);
  useDismiss(open, close, rootRef);
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('.menu input, .menu button')?.focus({ preventScroll: true });
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + delta + items.length) % items.length]?.focus();
  };

  return (
    <div className="select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div id={menuId} className={`menu ${menuClassName ?? ''}`} onKeyDown={onMenuKey} style={align === 'right' ? { right: 0, top: 'calc(100% + 2px)' } : { left: 0, top: 'calc(100% + 2px)' }}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  prefix?: string;
  align?: 'left' | 'right';
}

export function Select<T extends string | number>({ label, value, options, onChange, prefix, align }: SelectProps<T>) {
  const current = options.find((option) => option.value === value);
  return (
    <Dropdown
      label={label}
      align={align}
      trigger={
        <>
          <span className="truncate">
            {prefix && <span className="muted">{prefix} </span>}
            {current?.label ?? String(value)}
          </span>
          <ChevronDown size={14} />
        </>
      }
    >
      {(close) =>
        options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            className="menu__item"
            onClick={() => {
              onChange(option.value);
              close();
            }}
          >
            <span className="grow">{option.label}</span>
            {option.value === value && <Check size={14} />}
          </button>
        ))
      }
    </Dropdown>
  );
}
