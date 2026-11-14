import type { Environment, LogEntry, TraceSpan, TraceSummary } from '@telemetry';
import type { FieldResolver } from './facets';
import type { Issue } from './model';

const normalise = (key: string) => key.toLowerCase().replace(/[_.-]/g, '');

/** Status codes are derived: the telemetry carries span status and outcome only. */
export function derivedStatusCode(status: string): { code: number; label: string; tone: 'ok' | 'error' } {
  return status === 'error' ? { code: 500, label: '500 - Error', tone: 'error' } : { code: 200, label: '200 - OK', tone: 'ok' };
}

export function logFieldResolver(env: Environment): FieldResolver<LogEntry> {
  return (log, key) => {
    switch (normalise(key)) {
      case 'level':
      case 'severity': return log.severity;
      case 'workload':
      case 'service': return log.service;
      case 'pod':
      case 'instance': return log.pod;
      case 'host':
      case 'node': return log.node;
      case 'version': return log.version;
      case 'scenario': return log.scenario;
      case 'outcome': return log.outcome;
      case 'traceid':
      case 'trace': return log.traceId;
      case 'spanid': return log.spanId;
      case 'resource':
      case 'span':
      case 'spanname': return log.spanName || '(none)';
      case 'format': return 'otel';
      case 'environment':
      case 'env': return env.environment;
      case 'cluster': return env.cluster;
      case 'namespace': return env.namespace;
      case 'runid': return log.runId;
      default: return undefined;
    }
  };
}

export function logText(log: LogEntry): string {
  return `${log.body} ${log.service} ${log.pod} ${log.spanName} ${log.traceId} ${log.spanId} ${log.scenario} ${log.outcome}`.toLowerCase();
}

export interface SpanRow {
  span: TraceSpan;
  trace: TraceSummary;
}

export function spanFieldResolver(env: Environment): FieldResolver<SpanRow> {
  return ({ span, trace }, key) => {
    switch (normalise(key)) {
      case 'status': return span.status;
      case 'statuscode':
      case 'code': return String(derivedStatusCode(span.status).code);
      case 'workload':
      case 'service': return span.service;
      case 'resource':
      case 'name': return span.name;
      case 'kind': return span.kind;
      case 'source': return 'opentelemetry';
      case 'scenario': return span.scenario;
      case 'outcome': return span.outcome;
      case 'pod': return span.pod;
      case 'host':
      case 'node': return span.node;
      case 'version': return span.version;
      case 'traceid':
      case 'trace': return trace.traceId;
      case 'spanid': return span.spanId;
      case 'environment':
      case 'env': return env.environment;
      case 'cluster': return env.cluster;
      default: return undefined;
    }
  };
}

export function spanText({ span, trace }: SpanRow): string {
  return `${span.name} ${span.service} ${span.pod} ${span.spanId} ${trace.traceId}`.toLowerCase();
}

export function traceFieldResolver(env: Environment): FieldResolver<TraceSummary> {
  return (trace, key) => {
    switch (normalise(key)) {
      case 'status': return trace.status;
      case 'statuscode':
      case 'code': return String(derivedStatusCode(trace.status).code);
      case 'workload':
      case 'service': return trace.rootService;
      case 'resource':
      case 'name': return trace.rootName;
      case 'scenario': return trace.scenario;
      case 'outcome': return trace.outcome;
      case 'traceid':
      case 'trace': return trace.traceId;
      case 'source': return 'opentelemetry';
      case 'environment':
      case 'env': return env.environment;
      case 'cluster': return env.cluster;
      default: return undefined;
    }
  };
}

export function traceText(trace: TraceSummary): string {
  return `${trace.rootName} ${trace.rootService} ${trace.traceId} ${trace.services.join(' ')}`.toLowerCase();
}

export function issueFieldResolver(env: Environment): FieldResolver<Issue> {
  return (issue, key) => {
    switch (normalise(key)) {
      case 'severity': return issue.severity;
      case 'workload':
      case 'service': return issue.workload;
      case 'kind':
      case 'type': return issue.kind;
      case 'cluster': return env.cluster;
      case 'namespace': return env.namespace;
      case 'environment':
      case 'env': return env.environment;
      default: return undefined;
    }
  };
}

export function issueText(issue: Issue): string {
  return `${issue.title} ${issue.detail} ${issue.workload}`.toLowerCase();
}
