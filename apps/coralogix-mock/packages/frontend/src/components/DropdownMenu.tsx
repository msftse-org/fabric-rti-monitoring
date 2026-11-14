import type { ReactNode } from 'react';
import { Popover } from './Popover';

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** When defined the item behaves like a radio option. */
  selected?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  onSelect: () => void;
}

interface DropdownMenuProps {
  ariaLabel: string;
  trigger: ReactNode;
  triggerClassName?: string;
  items: MenuItem[];
  align?: 'left' | 'right';
  panelClassName?: string;
}

export function DropdownMenu({ ariaLabel, trigger, triggerClassName, items, align, panelClassName }: DropdownMenuProps) {
  return (
    <Popover ariaLabel={ariaLabel} trigger={trigger} triggerClassName={triggerClassName} align={align} role="menu" panelClassName={panelClassName}>
      {(close) =>
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            role={item.selected === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.selected}
            disabled={item.disabled}
            className={`menu-item${item.selected ? ' is-selected' : ''}`}
            onClick={() => {
              item.onSelect();
              close();
            }}
          >
            <span className="menu-item-label">{item.label}</span>
            {item.hint && <span className="menu-item-hint">{item.hint}</span>}
          </button>
        ))
      }
    </Popover>
  );
}
