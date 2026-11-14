import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { formatAgo } from '@telemetry';
import { SeverityBadge } from '../components/Badges';
import { FacetSidebar } from '../components/FacetSidebar';
import { FilterActions } from '../components/FilterActions';
import { FilterBar, type SuggestField } from '../components/FilterBar';
import { Sparkline } from '../components/Sparkline';
import { EmptyState } from '../components/States';
import { useView } from '../lib/data';
import { buildGroups, filterItems, onlyFacet, toggleFacet, tokenize, type FacetDef } from '../lib/facets';
import { issueFieldResolver, issueText } from '../lib/fields';
import { useMediaQuery } from '../lib/hooks';
import type { Issue } from '../lib/model';
import { workloadColor } from '../lib/palette';
import { href, navigate, useSyncParams } from '../lib/router';

const SEVERITY_COLOR = { S1: '#b3261e', S2: '#e0782f', S3: '#e5a21a' } as const;

const FACETS: FacetDef<Issue>[] = [
  { id: 'severity', label: 'Severity', keys: ['severity'], value: (issue) => issue.severity, color: (value) => SEVERITY_COLOR[value as Issue['severity']] },
  { id: 'workload', label: 'Workload', keys: ['workload', 'service'], value: (issue) => issue.workload, color: (value) => workloadColor(value) },
  { id: 'kind', label: 'Kind', keys: ['kind', 'type'], value: (issue) => issue.kind },
];

export function IssuesPage({ initialQuery }: { initialQuery: string }) {
  const view = useView();
  const env = view.bundle.environment;
  const mobile = useMediaQuery('(max-width: 900px)');
  const [tokens, setTokens] = useState(() => tokenize(initialQuery));
  const [facetsOpen, setFacetsOpen] = useState(!mobile);
  useSyncParams('issues', { q: tokens.join(' ') });

  const resolve = useMemo(() => issueFieldResolver(env), [env]);
  const filtered = useMemo(
    () => filterItems(view.issues, tokens, resolve, issueText).sort((a, b) => a.severity.localeCompare(b.severity) || a.since - b.since),
    [view.issues, tokens, resolve],
  );
  const groups = useMemo(() => buildGroups(view.issues, FACETS, tokens, resolve, issueText), [view.issues, tokens, resolve]);
  const fields = useMemo<SuggestField[]>(
    () => [
      { key: 'severity', values: ['S1', 'S2', 'S3'] },
      { key: 'workload', values: view.workloads.map((workload) => workload.name) },
      { key: 'kind', values: ['errors', 'latency'] },
    ],
    [view.workloads],
  );

  return (
    <div className="page page--issues">
      <FilterBar
        tokens={tokens}
        onChange={setTokens}
        fields={fields}
        label="Filter issues"
        placeholder="Type / to filter by severity, workload and more"
        actions={<FilterActions />}
      />
      <div className={`explorer${facetsOpen ? '' : ' explorer--closed'}`}>
        {facetsOpen && (
          <>
            {mobile && <div className="scrim" onClick={() => setFacetsOpen(false)} aria-hidden="true" />}
            <div className={`explorer__facets${mobile ? ' explorer__facets--drawer' : ''}`}>
              <FacetSidebar
                groups={groups}
                matched={filtered.length}
                noun="results"
                onToggle={(group, value) => setTokens(toggleFacet(tokens, group, value))}
                onOnly={(group, value) => setTokens(onlyFacet(tokens, group, value))}
              />
            </div>
          </>
        )}
        <div className="explorer__main">
          <div className="explorer__toolbar">
            <button type="button" className="btn btn--ghost" aria-expanded={facetsOpen} onClick={() => setFacetsOpen((value) => !value)}>
              {facetsOpen ? <ChevronLeft size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {facetsOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            <div className="card__spacer" />
            <span className="muted">Derived from error rate (≥ 5%) and p95 latency (≥ 500ms) per workload</span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState title={view.issues.length === 0 ? 'No issues firing' : 'No issues match'} action={tokens.length ? <button type="button" className="btn" onClick={() => setTokens([])}>Clear filters</button> : undefined}>
              {view.issues.length === 0 ? 'Every workload is within the error-rate and latency thresholds for this time range.' : 'Nothing in this time range matches the current filters.'}
            </EmptyState>
          ) : (
            <div className="table-scroll explorer__table">
              <table className="table table--issues">
                <thead><tr><th>Name</th><th>Timeline</th><th>Status</th></tr></thead>
                <tbody>
                  {filtered.map((issue) => {
                    const workload = view.workloadByName.get(issue.workload);
                    const trend = (workload?.series ?? []).map((point) => (issue.kind === 'errors' ? point.errors : point.requests > 0 ? point.p95 : 0));
                    const minutes = Math.max(1, Math.round((view.newest - issue.since) / 60_000));
                    return (
                      <tr key={issue.id} className="row--link" tabIndex={0} onClick={() => navigate(`workloads/${issue.workload}`, { tab: 'overview' })} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`workloads/${issue.workload}`); }}>
                        <td>
                          <div className="issue-title">
                            <a href={href(`workloads/${issue.workload}`)} onClick={(event) => event.stopPropagation()}>{issue.title}</a>
                            <span className="tag">{issue.detail}</span>
                          </div>
                          <div className="chips">
                            <span className="tag"><b>cluster</b> {env.cluster}</span>
                            <span className="tag"><b>namespace</b> {env.namespace}</span>
                            <span className="tag"><b>workload</b> {issue.workload}</span>
                            <span className="muted issue-since"><Clock size={12} aria-hidden="true" />{formatAgo(new Date(issue.since).toISOString(), view.newest)}</span>
                          </div>
                        </td>
                        <td><Sparkline values={trend} color={SEVERITY_COLOR[issue.severity]} width={150} height={28} bars label={`${issue.workload} ${issue.kind === 'errors' ? 'errors' : 'p95'} per minute`} /></td>
                        <td><span className="firing"><SeverityBadge severity={issue.severity} />Firing {minutes}m</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
