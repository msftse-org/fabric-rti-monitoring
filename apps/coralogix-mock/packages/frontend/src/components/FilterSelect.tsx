import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from './DropdownMenu';

interface FilterSelectProps {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
}

/** `label | Select ⌄` control used by the Coralogix catalog and drilldown filter rows. */
export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <div className="filter-select">
      <span className="filter-select-label">{label}</span>
      <DropdownMenu
        ariaLabel={`Filter by ${label}`}
        triggerClassName={`filter-select-value${value ? ' has-value' : ''}`}
        trigger={
          <>
            <span>{value ?? 'Select'}</span>
            <ChevronDown size={14} aria-hidden />
          </>
        }
        items={[
          { id: '__none', label: 'Select', selected: value === null, onSelect: () => onChange(null) },
          ...options.map((option) => ({ id: option, label: option, selected: value === option, onSelect: () => onChange(option) })),
        ]}
      />
    </div>
  );
}
