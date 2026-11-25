import test from 'node:test';
import assert from 'node:assert/strict';

// Optional browser regression, separate from the dependency-free model tests.
// Use an already-installed Playwright via PLAYWRIGHT_MODULE and a running dev server.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ADVISOR_URL || 'http://localhost:5185';
const targets = {
  version: 1, discoveredAt: '2026-11-21T12:00:00Z',
  workspaceName: 'Pilot', eventhouseName: 'Telemetry',
  queryUri: 'https://inventory.kusto.fabric.microsoft.com', database: 'pilot',
  grafanaUrl: '', collectorName: '', collectorEndpoint: '',
};
async function openPlanner(t, available) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/deployment-targets.json', route => available()
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(targets) })
    : route.fulfill({ status: 404, body: '' }));
  await page.goto(`${base}/#otel/input`);
  return page;
}

test('404 inventory: manual query and database stay visible through sequential typing; refresh collapses without losing overrides', async t => {
  let available = false;
  const page = await openPlanner(t, () => available);
  await page.getByText('Deployment inventory is unavailable.', { exact: false }).waitFor();
  const query = page.locator('#otel-queryUri');
  const uri = 'https://example.kusto.fabric.microsoft.com';
  await query.pressSequentially(uri);
  assert.equal(await query.inputValue(), uri);
  assert.equal(await query.isVisible(), true);
  assert.equal(await query.evaluate(node => node === document.activeElement), true);
  const database = page.locator('#otel-database');
  await database.fill('');
  await database.pressSequentially('manual-db');
  assert.equal(await database.inputValue(), 'manual-db');
  assert.equal(await database.isVisible(), true);

  await page.getByText('Have different pipelines/exporters?', { exact: false }).click();
  await page.locator('#otel-logsTable').fill('CustomLogs');
  await page.locator('#otel-logsPipeline').fill('logs/custom');
  await page.locator('#otel-auth').selectOption('workload');
  await page.locator('#otel-shared-exporters').fill('otlp/current, debug');
  available = true;
  await page.getByText('Edit destination', { exact: true }).click();
  await page.locator('#otel-load-targets').click();
  await page.getByText('Destination loaded from deployment inventory', { exact: false }).waitFor();
  assert.equal(await query.inputValue(), targets.queryUri);
  assert.equal(await query.isVisible(), false);
  assert.equal(await database.isVisible(), false);
  assert.equal(await page.locator('#otel-logsTable').inputValue(), 'CustomLogs');
  assert.equal(await page.locator('#otel-logsPipeline').inputValue(), 'logs/custom');
  assert.equal(await page.locator('#otel-auth').inputValue(), 'workload');
  assert.equal(await page.locator('#otel-shared-exporters').inputValue(), 'otlp/current, debug');
  assert.equal(new URL(page.url()).hash, '#otel/input');
});

test('successful automatic inventory keeps known query/database fields collapsed and editable in destination details', async t => {
  const page = await openPlanner(t, () => true);
  await page.getByText('Destination loaded from deployment inventory', { exact: false }).waitFor();
  const query = page.locator('#otel-queryUri');
  const database = page.locator('#otel-database');
  assert.equal(await query.count(), 1);
  assert.equal(await query.inputValue(), targets.queryUri);
  assert.equal(await query.isVisible(), false);
  assert.equal(await database.isVisible(), false);
  await page.getByText('Edit destination', { exact: true }).click();
  assert.equal(await query.isVisible(), true);
  await query.fill('');
  await query.pressSequentially('https://override.kusto.fabric.microsoft.com');
  assert.equal(await query.inputValue(), 'https://override.kusto.fabric.microsoft.com');
  assert.equal(await query.isVisible(), true);
  assert.equal(await database.inputValue(), targets.database);
});
