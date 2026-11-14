import { useState } from 'react';
import { LogExplorer } from '../LogExplorer';
import { outcomeOf, type ServiceTabProps } from './types';

export function ServiceLogs({ service, filters }: ServiceTabProps) {
  const [query, setQuery] = useState('');
  return (
    <LogExplorer
      query={query}
      onApply={setQuery}
      scope={{ service: service.name, scenario: filters.transaction, outcome: outcomeOf(filters.statusCode) }}
      placeholder={`Search ${service.name} logs, e.g. severity:ERROR`}
    />
  );
}
