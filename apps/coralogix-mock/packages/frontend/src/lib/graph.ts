import type { DatabaseStats, EdgeStats, Health, ServiceStats } from './derive';

export const NODE_W = 160;
export const NODE_H = 64;
const GAP_X = 72;
const GAP_Y = 32;
const PAD = 24;

export interface GraphNode {
  id: string;
  kind: 'service' | 'database';
  level: number;
  x: number;
  y: number;
  health: Health;
  requests: number;
  errorRate: number;
  avgMs: number;
  service?: ServiceStats;
  database?: DatabaseStats;
}

export interface Graph {
  nodes: GraphNode[];
  edges: EdgeStats[];
  width: number;
  height: number;
  byId: Map<string, GraphNode>;
}

/** Longest-path layering: every edge points from a lower to a higher column. */
function levels(ids: string[], edges: EdgeStats[]): Map<string, number> {
  const level = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const next = (level.get(edge.from) ?? 0) + 1;
      if (next > (level.get(edge.to) ?? 0)) {
        level.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return level;
}

export function buildGraph(services: ServiceStats[], databases: DatabaseStats[], edges: EdgeStats[]): Graph {
  const ids = [...services.map((service) => service.name), ...databases.map((database) => database.name)];
  const level = levels(ids, edges);
  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const column = level.get(id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), id]);
  }
  const tallest = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * GAP_Y;
  const columnCount = Math.max(1, ...[...columns.keys()].map((column) => column + 1));

  const nodes: GraphNode[] = [];
  for (const [column, members] of columns) {
    const columnHeight = members.length * NODE_H + (members.length - 1) * GAP_Y;
    members.forEach((id, row) => {
      const service = services.find((candidate) => candidate.name === id);
      const database = databases.find((candidate) => candidate.name === id);
      const base = { id, level: column, x: PAD + column * (NODE_W + GAP_X), y: (height - columnHeight) / 2 + row * (NODE_H + GAP_Y) };
      if (service) {
        nodes.push({ ...base, kind: 'service', health: service.health, requests: service.requests, errorRate: service.errorRate, avgMs: service.avgMs, service });
      } else if (database) {
        nodes.push({ ...base, kind: 'database', health: database.health, requests: database.calls, errorRate: database.errorRate, avgMs: database.avgMs, database });
      }
    });
  }

  return {
    nodes,
    edges,
    width: PAD * 2 + columnCount * NODE_W + (columnCount - 1) * GAP_X,
    height,
    byId: new Map(nodes.map((node) => [node.id, node])),
  };
}
