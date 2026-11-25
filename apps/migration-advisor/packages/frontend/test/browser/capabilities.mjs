import test from 'node:test';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ADVISOR_URL || 'http://localhost:5185';

for (const [device, viewport, theme] of [
  ['desktop', { width: 1440, height: 1000 }, 'light'],
  ['mobile', { width: 390, height: 844 }, 'dark'],
]) test(`${device}: vendor scope, preserved notebook choices, evidence, print/export and keyboard access`, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport, colorScheme: theme });
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/#map`);
  const rows = page.locator('.feature-row');
  const search = page.getByRole('textbox', { name: 'Search source or target features' });
  const inspector = page.locator('#feature-inspector');
  const chooseVendor = vendor => page.getByRole('button', { name: vendor, exact: true }).click();
  assert.equal(await rows.count(), 27);
  assert.match(await page.locator('.register-summary').innerText(), /6 \/ 27/);

  await search.fill('notebook');
  assert.equal(await rows.count(), 1);
  await page.getByRole('checkbox', { name: 'Include Datadog Notebooks in scope', exact: true }).check();
  await rows.locator('.row-main').focus();
  await page.keyboard.press('Enter');
  assert.equal(await inspector.getByRole('heading', { level: 2 }).innerText(), 'Datadog Notebooks');
  assert.equal(await inspector.getByRole('heading', { level: 2 }).evaluate(node => node === document.activeElement), true);
  await inspector.getByRole('spinbutton', { name: 'Inventory count' }).fill('3');
  await inspector.getByRole('combobox', { name: 'Priority' }).selectOption('Should');
  assert.equal(await inspector.locator('a[href="https://docs.datadoghq.com/notebooks/llms.txt"]').count(), 1);
  assert.match(await inspector.innerText(), /Reviewed 2026-11-21/);
  assert.match(await page.locator('.register-summary').innerText(), /7 \/ 27/);

  await chooseVendor('Coralogix');
  assert.equal(await inspector.count(), 0);
  assert.equal(await rows.count(), 0);
  assert.match(await page.locator('.empty').innerText(), /No matching features/);
  assert.match(await page.locator('.register-summary').innerText(), /6 \/ 26/);
  await page.locator('.capability-scope summary').click();
  assert.match(await page.locator('.capability-scope').innerText(), /Not verified in reviewed documentation/);
  assert.match(await page.locator('.capability-scope').innerText(), /saved selections remain/i);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  assert.equal(await rows.count(), 26);
  for (const [name, kind] of [
    ['PagerDuty on-call integration', 'Integration'],
    ['Synthetic monitoring via Checkly', 'Integration'],
    ['Database client-span insights', 'Limited scope'],
    ['Snowbit CSPM scanners', 'Separate offering'],
    ['Snowbit SIEM / MDR', 'Separate offering'],
    ['Coralogix Continuous Profiling', 'Native'],
    ['Coralogix Session Replay', 'Native'],
    ['SLO Center & service SLOs', 'Native'],
    ['Coralogix Cases', 'Native'],
  ]) assert.equal(await rows.filter({ has: page.getByText(name, { exact: true }) }).locator('.capability-kind').innerText(), kind);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Applications');
  await page.getByRole('combobox', { name: 'Mapping status', exact: true }).selectOption('Redesign');
  assert.equal(await rows.count(), 2);
  await search.fill('client-span');
  assert.equal(await rows.count(), 1);
  await rows.locator('.row-main').click();
  assert.equal(await inspector.getByRole('heading', { level: 2 }).innerText(), 'Database client-span insights');
  assert.match(await inspector.innerText(), /Limited scope/);
  assert.match(await inspector.innerText(), /spanmetrics/);
  assert.match(await inspector.innerText(), /no database agent is required/i);
  assert.equal(await inspector.locator('a[href="https://coralogix.com/docs/user-guides/apm-v2/databases/"]').count(), 1);
  await page.getByRole('checkbox', { name: 'Include Database client-span insights in scope', exact: true }).check();
  assert.match(await page.locator('.register-summary').innerText(), /7 \/ 26/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const document = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(document.vendor, 'Coralogix');
  assert.equal(document.mappings.length, 26);
  assert.ok(!document.mappings.some(f => f.id === 'notebooks'));
  assert.equal(document.mappings.find(f => f.id === 'db').capability.support, 'Limited scope');
  assert.equal(Object.keys(document.plan).length, 27);
  assert.deepEqual(document.plan.notebooks, { needed: true, count: 3, priority: 'Should', target: 'KQL querysets' });
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__printed), true);
  await page.emulateMedia({ media: 'print' });
  const report = page.locator('.print-report');
  assert.equal(await report.isVisible(), true);
  assert.equal(await report.locator('article').count(), 7);
  assert.equal(await report.locator('article').filter({ hasText: 'Datadog Notebooks' }).count(), 0);
  assert.match(await report.innerText(), /Database client-span insights/);
  assert.match(await report.innerText(), /Limited scope/);
  assert.match(await report.innerText(), /reviewed 2026-11-21/);
  await page.emulateMedia({ media: 'screen' });
  if (process.env.ADVISOR_SCREENSHOT_DIR) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${process.env.ADVISOR_SCREENSHOT_DIR}/advisor-capabilities-${device}.png` });
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await chooseVendor('Datadog');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('All');
  await search.fill('notebook');
  assert.equal(await rows.count(), 1);
  assert.equal(await page.getByRole('checkbox', { name: 'Include Datadog Notebooks in scope', exact: true }).isChecked(), true);
  await rows.locator('.row-main').click();
  assert.equal(await inspector.getByRole('spinbutton', { name: 'Inventory count' }).inputValue(), '3');
  assert.equal(await inspector.getByRole('combobox', { name: 'Priority' }).inputValue(), 'Should');
  await inspector.getByRole('button', { name: 'Close feature inspector', exact: true }).click();
  assert.equal(await rows.locator('.row-main').evaluate(node => node === document.activeElement), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
});
