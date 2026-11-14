import type { ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useEscape } from '../lib/hooks';

export interface DetailField {
  label: string;
  value: string;
  display?: ReactNode;
  /** Filter token key; fields without one cannot be added to the filter bar. */
  filterKey?: string;
}

interface DetailPanelProps {
  title: string;
  subtitle?: ReactNode;
  fields: DetailField[];
  actions?: ReactNode;
  onClose: () => void;
  onFilter?: (key: string, value: string, negate: boolean) => void;
}

export function FieldList({ fields, onFilter }: { fields: DetailField[]; onFilter?: DetailPanelProps['onFilter'] }) {
  return (
    <dl className="detail__fields">
      {fields.map((field) => (
        <div key={field.label} className="detail__row">
          <dt>{field.label}</dt>
          <dd>
            <span className="detail__value">{field.display ?? field.value}</span>
            {field.filterKey && onFilter && (
              <span className="detail__filters">
                <button type="button" aria-label={`Filter ${field.label} = ${field.value}`} title="Add to filter" onClick={() => onFilter(field.filterKey as string, field.value, false)}>
                  <Plus size={12} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Exclude ${field.label} = ${field.value}`} title="Exclude from filter" onClick={() => onFilter(field.filterKey as string, field.value, true)}>
                  <Minus size={12} aria-hidden="true" />
                </button>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Right-hand attribute panel shared by Logs and Traces. */
export function DetailPanel({ title, subtitle, fields, actions, onClose, onFilter }: DetailPanelProps) {
  useEscape(onClose, true);
  return (
    <aside className="detail" aria-label={title}>
      <div className="detail__head">
        <h2>{title}</h2>
        <div className="detail__spacer" />
        {actions}
        <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {subtitle && <div className="detail__sub">{subtitle}</div>}
      <FieldList fields={fields} onFilter={onFilter} />
    </aside>
  );
}
