// Exports one telemetry bundle as a static JSON file for each app, so a deployed
// (Fabric-hosted) build has data without any backend or credential.
//   node snapshot.mjs [minutes]     (default: 60)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBundle } from './queries.mjs';
import { loadTarget } from './kusto.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const apps = ['datadog-mock', 'coralogix-mock', 'groundcover-mock', 'rti-oncall'];
const minutes = Number.parseInt(process.argv[2] ?? '60', 10);

// A snapshot is read once, so it keeps every log in the window. The live API stays capped
// because it is polled, and a capped sample skews the log histograms towards errors.
const bundle = await fetchBundle({ minutes, target: await loadTarget(), source: 'snapshot', limits: { logs: 100000, errorLogs: 100000 } });
const json = JSON.stringify(bundle);
for (const app of apps) {
  const directory = join(here, '..', app, 'packages', 'frontend', 'public');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'telemetry.snapshot.json'), json);
}
console.log(`Snapshot ${bundle.generatedAt}: ${bundle.totals.spans} spans, ${bundle.totals.traces} traces, ${bundle.totals.logs} logs, ${bundle.services.length} services (${(json.length / 1024).toFixed(0)} KB per app).`);
