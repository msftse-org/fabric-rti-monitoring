import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export interface Attribute {
  key: string;
  value: string;
  /** Query field name used by the filter buttons; omit to hide them. */
  field?: string;
  render?: ReactNode;
}

interface AttributeListProps {
  attributes: Attribute[];
  onFilter?: (field: string, value: string, negate: boolean) => void;
}

export function AttributeList({ attributes, onFilter }: AttributeListProps) {
  return (
    <dl className="attr-list">
      {attributes.map((attribute) => (
        <div className="attr-row" key={attribute.key}>
          <dt>{attribute.key}</dt>
          <dd>
            <span className="attr-value">{attribute.render ?? attribute.value}</span>
            {onFilter && attribute.field && attribute.value !== '' && (
              <span className="attr-actions">
                <button type="button" className="icon-btn icon-btn--small" aria-label={`Filter in ${attribute.key}`} title="Filter in" onClick={() => onFilter(attribute.field as string, attribute.value, false)}>
                  <Plus size={12} />
                </button>
                <button type="button" className="icon-btn icon-btn--small" aria-label={`Filter out ${attribute.key}`} title="Filter out" onClick={() => onFilter(attribute.field as string, attribute.value, true)}>
                  <Minus size={12} />
                </button>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
