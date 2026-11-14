import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

interface PopoverProps {
  ariaLabel: string;
  trigger: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  align?: 'left' | 'right';
  role?: 'menu' | 'dialog';
  disabled?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
}

const ITEM_SELECTOR = '[role^="menuitem"]:not([disabled])';

export function Popover({ ariaLabel, trigger, triggerClassName, panelClassName, align = 'left', role = 'dialog', disabled, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && role === 'menu') panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, [open, role]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (role !== 'menu' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div className="popover" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-haspopup={role === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div ref={panelRef} role={role} aria-label={ariaLabel} className={`popover-panel popover-panel--${align} ${panelClassName ?? ''}`} onKeyDown={onPanelKeyDown}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
