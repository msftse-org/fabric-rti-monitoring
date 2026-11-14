import { useMemo, useState } from 'react';
import { navigate, paths } from '../../lib/router';
import { useApp } from '../../lib/app';
import type { ServiceStat } from '../../lib/derive';
import { TraceTable, type TraceSortKey } from '../../components/TraceTable';
import { EmptyState } from '../../components/ui';

const PAGE = 50;

export function TracesTab({ stat }: { stat: ServiceStat }) {
  const data = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<{ key: TraceSortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const rows = useMemo(() => {
    const pick = { date: (t: (typeof data.traces)[number]) => t.ms, duration: (t: (typeof data.traces)[number]) => t.durationMs, spans: (t: (typeof data.traces)[number]) => t.spanCount }[sort.key];
    return data.traces.filter((trace) => trace.services.includes(stat.name)).sort((a, b) => (pick(a) - pick(b)) * sort.dir);
  }, [data.traces, stat.name, sort]);

  if (!rows.length) return <EmptyState title="No traces">No retained traces pass through {stat.name} in the selected window.</EmptyState>;
  return (
    <div className="svc__pad">
      <div className="svc__tracebar">
        <span className="muted">
          {rows.length.toLocaleString()} traces through <b>{stat.name}</b>
        </span>
        <button type="button" className="link-btn" onClick={() => navigate(paths.traces(`service:${stat.name}`))}>
          Open in Trace Explorer
        </button>
      </div>
      <div className="card">
        <TraceTable
          rows={rows.slice(0, limit)}
          total={rows.length}
          spans={data.bundle.spans}
          sort={sort}
          onSort={(key) => setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : -1 }))}
          onOpen={(traceId) => navigate(paths.trace(traceId))}
          onLoadMore={() => setLimit((value) => value + PAGE)}
        />
      </div>
    </div>
  );
}
