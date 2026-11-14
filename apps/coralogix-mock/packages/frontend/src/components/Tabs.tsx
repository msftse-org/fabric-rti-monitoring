import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  /** Hash link; tabs without one are handled through `onSelect`. */
  href?: string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  ariaLabel: string;
  onSelect?: (id: string) => void;
  className?: string;
}

/** Underlined tab strip. Link tabs render anchors, state tabs render an ARIA tablist with arrow-key navigation. */
export function Tabs({ items, active, ariaLabel, onSelect, className = '' }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isLinkList = items.some((item) => item.href !== undefined);

  if (isLinkList) {
    return (
      <nav className={`tabs ${className}`} aria-label={ariaLabel}>
        {items.map((item) => {
          const content = (
            <>
              {item.icon}
              {item.label}
              {item.badge}
            </>
          );
          return item.href === undefined ? (
            <button key={item.id} type="button" className="tab" onClick={() => onSelect?.(item.id)}>
              {content}
            </button>
          ) : (
            <a
              key={item.id}
              href={item.href}
              className={`tab${item.id === active ? ' is-active' : ''}`}
              aria-current={item.id === active ? 'page' : undefined}
              onClick={() => onSelect?.(item.id)}
            >
              {content}
            </a>
          );
        })}
      </nav>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const next = buttons[(current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    next.click();
  };

  return (
    <div className={`tabs ${className}`} role="tablist" aria-label={ariaLabel} ref={listRef} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          tabIndex={item.id === active ? 0 : -1}
          className={`tab${item.id === active ? ' is-active' : ''}`}
          onClick={() => onSelect?.(item.id)}
        >
          {item.icon}
          {item.label}
          {item.badge}
        </button>
      ))}
    </div>
  );
}
