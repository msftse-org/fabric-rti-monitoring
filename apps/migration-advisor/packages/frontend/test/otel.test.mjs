import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultOtel, generateOtel, validateOtel, restoreOtel, parseTargets } from '../src/otel.ts';

const ready = () => ({
  ...defaultOtel(), queryUri: 'https://example.kusto.fabric.microsoft.com',
  logsExporters: 'datadog, otlp/archive', metricsExporters: 'datadog', tracesExporters: 'datadog',
});
test('replacement creates only Fabric pipelines with local OTLP receivers and no embedded credentials', () => {
  const result = generateOtel({ ...ready(), mode: 'replace', metrics: false, traces: false });
  assert.match(result.yaml, /endpoint: 127\.0\.0\.1:4318/);
  assert.match(result.yaml, /exporters: \["azuredataexplorer\/fabric"\]/);
  assert.doesNotMatch(result.yaml, /datadog|filter\/synthetic|metrics_table_name|traces_table_name/);
  assert.match(result.environment, /OTEL_EXPORTER_OTLP_ENDPOINT=http:\/\/127\.0\.0\.1:4318/);
  assert.match(result.verification, /OTELLogs\n\| where Timestamp/);
});
test('add-output fragment preserves all supplied exporters, only updates selected named pipelines, and deduplicates Fabric', () => {
  const result = generateOtel({ ...ready(), logsPipeline: 'logs/production', logsExporters: 'datadog, otlp/archive, datadog, azuredataexplorer/fabric', metrics: false, traces: false });
  assert.match(result.yaml, /"logs\/production":/);
  assert.match(result.yaml, /exporters: \["datadog","otlp\/archive","azuredataexplorer\/fabric"\]/);
  assert.doesNotMatch(result.yaml, /^receivers:|^processors:|^\s+receivers:|^\s+processors:/m);
  assert.match(result.yaml, /NOT A COMPLETE/);
  assert.doesNotMatch(result.environment, /OTEL_EXPORTER_OTLP_ENDPOINT=/);
});
test('each authentication choice generates exactly its own method with secret-store references', () => {
  for (const [auth, required, excluded] of [
    ['local', /use_azure_auth: true/, /managed_identity_id:|application_key:/],
    ['workload', /use_azure_auth: true/, /managed_identity_id:|application_key:/],
    ['system', /managed_identity_id: system/, /use_azure_auth:|application_key:/],
    ['user', /managed_identity_id: \$\{env:AZURE_CLIENT_ID\}/, /use_azure_auth:|application_key:/],
    ['principal', /application_key: \$\{env:AZURE_CLIENT_SECRET\}/, /use_azure_auth:|managed_identity_id:/],
  ]) {
    const { yaml } = generateOtel({ ...ready(), auth });
    assert.match(yaml, required);
    assert.doesNotMatch(yaml, excluded);
  }
});
test('invalid targets, injection, wrong pipeline types and missing original destinations block generation', () => {
  for (const changes of [
    { queryUri: 'http://example.com' }, { queryUri: 'https://user:secret@example.com' },
    { queryUri: 'https://example.com/v1/logs' }, { queryUri: 'https://example.com?token=secret' },
    { queryUri: 'https://example.com\nEXTRA=value' },
    { logsTable: 'Logs\nexporters:' }, { logsPipeline: 'traces' }, { logsExporters: 'datadog\nservice:' },
    { logsExporters: '' }, { logsExporters: 'azuredataexplorer/fabric' },
    { logs: false, metrics: false, traces: false },
  ]) {
    const settings = { ...ready(), ...changes };
    assert.ok(Object.keys(validateOtel(settings)).length);
    assert.throws(() => generateOtel(settings), /Correct OTel/);
  }
});
test('restores incomplete drafts safely but rejects unexpected credential fields and invalid options', () => {
  assert.deepEqual(restoreOtel(defaultOtel()), defaultOtel());
  assert.throws(() => restoreOtel({ ...ready(), apiKey: 'private' }), /schema/);
  assert.throws(() => restoreOtel({ ...ready(), auth: 'unknown' }), /option/);
  assert.throws(() => restoreOtel({ ...ready(), queryUri: 'https://user:secret@example.com' }), /fields/);
});
test('deployment inventory imports only allowlisted non-secret target values and validates endpoints', () => {
  const inventory = {
    version: 1, discoveredAt: '2026-11-21T12:00:00Z', workspaceName: 'RTI', eventhouseName: 'Telemetry',
    queryUri: ready().queryUri, database: 'observability', grafanaUrl: 'https://grafana.example.com',
    collectorName: 'collector', collectorEndpoint: 'https://collector.example.com', extra: 'not imported',
  };
  assert.equal(parseTargets(inventory).queryUri, inventory.queryUri);
  assert.equal('extra' in parseTargets(inventory), false);
  assert.throws(() => parseTargets({ ...inventory, queryUri: 'https://example.com?secret=private' }), /resource/);
  assert.throws(() => parseTargets({ ...inventory, discoveredAt: 'not-a-date' }), /resource/);
});
