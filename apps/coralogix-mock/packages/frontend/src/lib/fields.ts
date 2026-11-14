import type { Environment, LogEntry, TraceSpan, TraceSummary } from '@telemetry';
import type { FieldResolver } from './query';

export const LOG_FIELDS = ['service', 'severity', 'scenario', 'outcome', 'pod', 'node', 'traceId', 'spanId', 'spanName', 'durationMs', 'runId'];
export const SPAN_FIELDS = ['service', 'name', 'kind', 'status', 'scenario', 'outcome', 'pod', 'durationMs', 'traceId', 'spanId'];

export function logResolver(log: LogEntry, env: Environment): FieldResolver {
  return (key) => {
    switch (key.toLowerCase()) {
      case 'service':
      case 'subsystem':
      case 'subsystemname':
      case 'service.name':
        return log.service;
      case 'severity':
      case 'level':
        return log.severity;
      case 'pod':
      case 'k8s.pod.name':
        return log.pod;
      case 'node':
      case 'k8s.node.name':
        return log.node;
      case 'version':
      case 'service.version':
        return log.version;
      case 'scenario':
      case 'resource':
        return log.scenario;
      case 'outcome':
        return log.outcome;
      case 'traceid':
      case 'trace_id':
        return log.traceId;
      case 'spanid':
      case 'span_id':
        return log.spanId;
      case 'spanname':
      case 'operation':
        return log.spanName;
      case 'duration':
      case 'durationms':
        return log.durationMs === null ? undefined : String(log.durationMs);
      case 'runid':
      case 'run_id':
        return log.runId;
      case 'body':
      case 'message':
        return log.body;
      case 'namespace':
      case 'application':
      case 'applicationname':
        return env.namespace;
      case 'cluster':
        return env.cluster;
      case 'env':
      case 'environment':
        return env.environment;
      default:
        return undefined;
    }
  };
}

export function logHaystack(log: LogEntry): string {
  return `${log.body} ${log.service} ${log.severity} ${log.spanName} ${log.scenario} ${log.outcome} ${log.pod} ${log.traceId}`;
}

export interface SpanRow {
  span: TraceSpan;
  trace: TraceSummary;
  startMs: number;
}

export function spanResolver(row: SpanRow, env: Environment): FieldResolver {
  const { span, trace } = row;
  return (key) => {
    switch (key.toLowerCase()) {
      case 'service':
      case 'subsystem':
      case 'subsystemname':
      case 'service.name':
        return span.service;
      case 'name':
      case 'operation':
      case 'spanname':
        return span.name;
      case 'kind':
      case 'spankind':
        return span.kind;
      case 'status':
        return span.status;
      case 'scenario':
      case 'resource':
        return span.scenario;
      case 'outcome':
        return span.outcome;
      case 'pod':
      case 'k8s.pod.name':
        return span.pod;
      case 'node':
        return span.node;
      case 'version':
        return span.version;
      case 'duration':
      case 'durationms':
        return String(span.durationMs);
      case 'traceid':
      case 'trace_id':
        return trace.traceId;
      case 'spanid':
      case 'span_id':
        return span.spanId;
      case 'namespace':
      case 'application':
        return env.namespace;
      case 'cluster':
        return env.cluster;
      case 'env':
      case 'environment':
        return env.environment;
      default:
        return undefined;
    }
  };
}

export function spanHaystack(row: SpanRow): string {
  const { span, trace } = row;
  return `${span.name} ${span.service} ${span.kind} ${span.status} ${span.scenario} ${span.outcome} ${span.pod} ${trace.traceId}`;
}
