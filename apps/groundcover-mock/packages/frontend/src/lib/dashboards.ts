import type { MetricQuery } from './metrics';

export type SeriesMetric = 'requests' | 'errors' | 'errorRate' | 'p50' | 'p95' | 'p99';
export type StatMetric = 'rps' | 'requests' | 'errors' | 'errorRate' | 'p95' | 'logs' | 'errorLogs' | 'issues';
export type RankMetric = 'requests' | 'errors' | 'errorRate' | 'p95';
export type ChartKind = 'bar' | 'line' | 'area';

type Body =
  | { kind: 'stat'; metric: StatMetric }
  | { kind: 'scenarioStat'; scenario: string; stat: 'requests' | 'errorRate' | 'avgMs' }
  | { kind: 'timeseries'; metric: SeriesMetric; chart: ChartKind }
  | { kind: 'metric'; query: MetricQuery; chart: ChartKind }
  | { kind: 'toplist'; metric: RankMetric }
  | { kind: 'funnel' }
  | { kind: 'donut'; metric: 'requests' | 'errors' }
  | { kind: 'logs' }
  | { kind: 'table' };

export type Widget = { id: string; title: string; span: 3 | 4 | 6 | 8 | 12 } & Body;

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
}

export const DASHBOARDS: Dashboard[] = [
  {
    id: 'aks-services-overview',
    name: 'AKS Services Overview',
    description: 'Requests, errors and latency for every workload in otel-demo',
    widgets: [
      { id: 'rps', title: 'Requests / sec', span: 3, kind: 'stat', metric: 'rps' },
      { id: 'error-rate', title: 'Error rate', span: 3, kind: 'stat', metric: 'errorRate' },
      { id: 'p95', title: 'Worst p95 latency', span: 3, kind: 'stat', metric: 'p95' },
      { id: 'issues', title: 'Open issues', span: 3, kind: 'stat', metric: 'issues' },
      { id: 'requests', title: 'Requests per minute', span: 6, kind: 'timeseries', metric: 'requests', chart: 'bar' },
      { id: 'latency', title: 'p95 latency by workload', span: 6, kind: 'timeseries', metric: 'p95', chart: 'line' },
      { id: 'share', title: 'Requests by workload', span: 4, kind: 'donut', metric: 'requests' },
      { id: 'top-errors', title: 'Top workloads by error rate', span: 4, kind: 'toplist', metric: 'errorRate' },
      { id: 'logs', title: 'Log volume by level', span: 4, kind: 'logs' },
      { id: 'table', title: 'Workloads', span: 12, kind: 'table' },
    ],
  },
  {
    id: 'checkout-flow',
    name: 'Checkout Flow',
    description: 'The checkout scenario hop by hop: gateway → checkout → inventory → payment → shipping → notifications',
    widgets: [
      { id: 'checkout-requests', title: 'Checkout requests', span: 3, kind: 'scenarioStat', scenario: 'checkout', stat: 'requests' },
      { id: 'checkout-errors', title: 'Checkout error rate', span: 3, kind: 'scenarioStat', scenario: 'checkout', stat: 'errorRate' },
      { id: 'checkout-latency', title: 'Avg checkout latency (gateway)', span: 3, kind: 'scenarioStat', scenario: 'checkout', stat: 'avgMs' },
      { id: 'browse-requests', title: 'Browse requests', span: 3, kind: 'scenarioStat', scenario: 'browse', stat: 'requests' },
      { id: 'funnel', title: 'Requests reaching each hop', span: 4, kind: 'funnel' },
      {
        id: 'checkout-by-service',
        title: 'Checkout requests by workload',
        span: 8,
        kind: 'metric',
        chart: 'bar',
        query: { metric: 'demo.requests', agg: 'sum', groupBy: 'service', tokens: ['scenario:checkout'] },
      },
      {
        id: 'checkout-errors-by-service',
        title: 'Failed checkout requests by workload',
        span: 6,
        kind: 'metric',
        chart: 'bar',
        query: { metric: 'demo.requests', agg: 'sum', groupBy: 'service', tokens: ['scenario:checkout', 'outcome:error'] },
      },
      {
        id: 'checkout-latency-by-service',
        title: 'Avg duration by workload (checkout)',
        span: 6,
        kind: 'metric',
        chart: 'line',
        query: { metric: 'demo.request.duration', agg: 'avg', groupBy: 'service', tokens: ['scenario:checkout'] },
      },
    ],
  },
];

export function findDashboard(id: string): Dashboard | undefined {
  return DASHBOARDS.find((dashboard) => dashboard.id === id);
}
