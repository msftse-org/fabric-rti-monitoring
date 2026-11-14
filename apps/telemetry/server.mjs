// Loopback-only, read-only API used by the mock apps during local development.
//   node server.mjs            -> http://127.0.0.1:8787/api/telemetry?minutes=60
// It binds to 127.0.0.1, answers GET only and holds no credentials: queries run
// with your Azure CLI sign-in.
import { createServer } from 'node:http';
import { clampMinutes, fetchBundle, fetchHistory } from './queries.mjs';
import { loadTarget } from './kusto.mjs';

const PORT = Number.parseInt(process.env.TELEMETRY_PORT ?? '8787', 10);
const target = await loadTarget();
const cache = new Map();
// The multi-day on-call history moves in 5-minute buckets, so it is refreshed far less often than the bundle.
let historyCache = null;

function history() {
  if (historyCache && Date.now() - historyCache.at < 60_000) return historyCache.value;
  const pending = fetchHistory({ target });
  historyCache = { at: Date.now(), value: pending };
  pending.catch(() => {
    historyCache = null;
  });
  return pending;
}

async function bundle(minutes) {
  const hit = cache.get(minutes);
  if (hit && Date.now() - hit.at < 5_000) return hit.value;
  const pending = fetchBundle({ minutes, target, history: history() });
  cache.set(minutes, { at: Date.now(), value: pending });
  pending.catch(() => cache.delete(minutes));
  return pending;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const send = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'GET') return send(405, { error: 'Read-only API: use GET.' });
  if (url.pathname === '/api/health') return send(200, { ok: true, database: target.database });
  if (url.pathname !== '/api/telemetry') return send(404, { error: 'Not found.' });
  try {
    return send(200, await bundle(clampMinutes(url.searchParams.get('minutes'))));
  } catch (error) {
    console.error(error);
    return send(502, { error: 'Eventhouse query failed. Run `az login` and check KUSTO_CLUSTER_URI / KUSTO_DATABASE.' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Telemetry API on http://127.0.0.1:${PORT} (${target.database})`));
