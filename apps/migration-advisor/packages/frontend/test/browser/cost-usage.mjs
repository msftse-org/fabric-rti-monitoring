import test from 'node:test';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ADVISOR_URL || 'http://localhost:5185';
async function openCost(t, viewport) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}/#cost/input`);
  return page;
}
const forbidden = ['fabricSKU','region','fabricRate','hours','grafanaHours','grafanaRate','userRate','users','collector','aks','allocation','storageRate','cacheRate','targetDiscount','targetExtras'];
test('migration map omits the final three feature entries', async t => {
  const page = await openCost(t);
  await page.locator('#nav-map').click();
  await page.waitForURL('**/#map');
  assert.equal(await page.locator('.feature-row').count(), 27);
  for (const feature of ['API & data exports', 'Usage controls & quotas', 'Operational ownership & support']) {
    assert.equal(await page.getByText(feature, { exact: true }).count(), 0, feature);
  }
});
test('both vendors ask for source volumes only, including expanded assumptions', async t => {
  const page = await openCost(t);
  for (const vendor of ['Datadog','Coralogix']) {
    await page.getByRole('button', { name: vendor, exact: true }).click();
    for (const key of ['logsGB','traceGB','metricGB']) assert.equal(await page.locator(`#input-${key}`).isVisible(), true);
    await page.getByText('Advanced source assumptions', { exact: true }).click();
    for (const key of forbidden) assert.equal(await page.locator(`#input-${key}`).count(), 0, key);
    assert.equal(await page.getByRole('button', { name: /West US 3/ }).count(), 0);
  }
});
test('planning result keeps the sizing reference beside Fabric and folds uncertainty into assumptions', async t => {
  const page = await openCost(t);
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  assert.equal(await page.locator('.planning-estimate').count(), 0);
  assert.match(await page.locator('.sizing-reference').innerText(), /Sized for 13 GB\/day · F2 · 720 h\/month · West US 3/);
  const savings = await page.getByRole('region', { name: 'Savings summary' }).innerText();
  assert.match(savings, /Estimated monthly savings/);
  assert.match(savings, /lower than your current Datadog estimate/);
  const fabric = page.getByRole('region', { name: 'Azure + Fabric continuous-query reference cost ledger' });
  assert.equal(await fabric.isVisible(), true);
  const breakdown = await fabric.getByRole('figure', { name: 'Fabric cost breakdown' }).innerText();
  for (const part of ['Fabric capacity', 'OneLake storage', 'Grafana hosting', 'Grafana users', 'OTel Collector']) assert.match(breakdown, new RegExp(part));
  assert.equal(await fabric.locator('input').count(), 0);
  assert.equal(await fabric.getByRole('button', { name: /Enter rate/ }).count(), 0);
  const assumptions = page.locator('.automatic-details');
  assert.equal(await assumptions.locator('.warning').isVisible(), false);
  await page.getByText('Automatic target assumptions & limitations', { exact: true }).click();
  assert.match(await assumptions.innerText(), /Sensitivity references:/);
  assert.match(await assumptions.innerText(), /not a validated GB-to-Fabric sizing formula/i);
  assert.equal(await page.locator('.automatic-details input').count(), 0);
  await page.goBack();
  assert.equal(await page.locator('#input-logsGB').isVisible(), true);
});
test('unknown Coralogix rates remain unknown with source-only rate recovery', async t => {
  const page = await openCost(t);
  await page.getByRole('button', { name: 'Coralogix', exact: true }).click();
  await page.locator('#cost-next').click();
  const source = page.getByRole('region', { name: 'Coralogix cost ledger' });
  assert.match(await source.innerText(), /Known subtotal only/);
  await source.getByRole('button', { name: /Enter rate/ }).first().click();
  await page.waitForURL('**/#cost/input');
  await page.waitForFunction(() => document.activeElement?.id.startsWith('input-cx'));
});
test('source usage import restores values and invalidates results', async t => {
  const page = await openCost(t);
  await page.locator('#input-logsGB').fill('123');
  await page.getByText('Plan actions · save, restore & import', { exact: true }).click();
  await page.getByRole('button', { name: 'Save in this browser' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('migration-advisor-v1'));
  await page.locator('#input-logsGB').fill('321');
  await page.locator('#cost-next').click();
  await page.locator('input[type=file]').setInputFiles({ name:'plan.json', mimeType:'application/json', buffer:Buffer.from(saved) });
  await page.waitForURL('**/#cost/input');
  assert.equal(await page.locator('#input-logsGB').inputValue(), '123');
});
test('source validation exposes and focuses a real invalid field', async t => {
  const page = await openCost(t);
  await page.locator('#input-logsGB').fill('-1');
  await page.locator('#cost-next').click();
  assert.equal(new URL(page.url()).hash, '#cost/input');
  assert.equal(await page.locator('#input-logsGB').getAttribute('aria-invalid'), 'true');
  await page.waitForFunction(() => document.activeElement?.id === 'input-logsGB');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'input-logsGB');
});
test('mobile drawer traps keyboard, Escape restores focus, theme persists without overflow', async t => {
  const page = await openCost(t, { width:390, height:844 });
  const menu = page.getByRole('button', { name:'Open navigation' });
  await menu.click();
  await page.waitForFunction(() => document.activeElement?.id === 'nav-cost');
  await page.locator('#nav-sources').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('brand')), true);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open navigation');
  assert.equal(await menu.evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name:/Switch to .* theme/ }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
test('outside supported target range requires pilot sizing, never quote entry', async t => {
  const page=await openCost(t);
  await page.locator('#input-logsGB').fill('10000000');
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  assert.match(await page.locator('.sizing-reference').innerText(), /Beyond F1024 reference range/);
  const fabric = page.getByRole('region', { name: 'Azure + Fabric continuous-query reference cost ledger' });
  assert.match(await fabric.innerText(), /Outside planning range; pilot sizing required/);
  assert.doesNotMatch(await fabric.innerText(), /Quote needed|Enter rate/);
  assert.match(await page.getByRole('region', { name: 'Savings summary' }).innerText(), /Pilot sizing required/);
  assert.doesNotMatch(await page.getByRole('region', { name: 'Savings summary' }).innerText(), /Estimated monthly savings/);
  await page.getByText('Automatic target assumptions & limitations', { exact: true }).click();
  assert.match(await page.locator('.automatic-details').innerText(), /outside the reference sizing range; pilot sizing is required/i);
});
test('RUM Standard namespace limit suppresses the target and savings even with a shared TU', async t => {
  const page = await openCost(t, { width: 390, height: 844 });
  page.setDefaultTimeout(5000);
  await page.locator('summary').filter({ hasText: 'Real user monitoring' }).click();
  await page.getByLabel('Include Datadog RUM usage').check();
  await page.locator('#input-rumMonthlyGB').fill('105120');
  await page.locator('summary').filter({ hasText: 'RUM pricing & sizing assumptions' }).click();
  await page.getByLabel('Credit one already-paid TU in an alternative existing SAS-compatible namespace').check();
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  const ledger = page.getByRole('region', { name: 'Azure + Fabric continuous-query reference cost ledger' });
  let hubLine = ledger.locator('.cost-lines > div').filter({ hasText: 'Event Hubs Standard' });
  assert.equal((await hubLine.locator('dd').innerText()).trim(), '$854.10');
  assert.doesNotMatch(await ledger.innerText(), /Pilot sizing required/);

  await page.locator('#cost-edit').click();
  await page.locator('summary').filter({ hasText: 'Real user monitoring' }).click();
  await page.locator('#input-rumMonthlyGB').fill('105120.0001');
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  const results = page.locator('.flow-results');
  assert.match(await results.innerText(), /41.*40.TU.*Standard.*namespace/i);
  assert.match(await results.innerText(), /multiple namespaces or another tier.*separate sizing and pricing/i);
  assert.match(await ledger.innerText(), /Pilot sizing required/);
  hubLine = ledger.locator('.cost-lines > div').filter({ hasText: 'Event Hubs Standard' });
  assert.match(await hubLine.locator('dd').innerText(), /Pilot required/);
  const savings = await page.getByRole('region', { name: 'Savings summary' }).innerText();
  assert.match(savings, /Savings pending/);
  assert.doesNotMatch(savings, /outside the supported Fabric reference range/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
test('Sources & scope links to both IBM Plex and Application Insights SDK notices', async t => {
  const page = await openCost(t);
  page.setDefaultTimeout(5000);
  await page.goto(`${base}/#sources`);
  const sources = page.locator('.sources');
  assert.equal(await sources.getByRole('link', { name: /complete SIL Open Font License/i }).isVisible(), true);
  const sdkLicense = sources.getByRole('link', { name: /Application Insights SDK.*license notices/i });
  assert.equal(await sdkLicense.getAttribute('href'), './licenses/application-insights-sdk.txt');
  assert.equal(await sdkLicense.isVisible(), true);
  const response = await page.request.get(new URL('./licenses/application-insights-sdk.txt', base).href);
  assert.equal(response.status(), 200);
});
test('legacy totals restore for viewing only and source billing days remain editable', async t => {
  const page=await openCost(t);
  await page.getByText('Plan actions · save, restore & import', { exact:true }).click();
  await page.getByRole('button', {name:'Save in this browser'}).click();
  await page.evaluate(()=>{
    const document=JSON.parse(localStorage.getItem('migration-advisor-v1'));
    document.comparison={method:'totals',sourceMonthly:'120',targetMonthly:'80'};
    localStorage.setItem('migration-advisor-v1',JSON.stringify(document));
  });
  await page.getByRole('button', {name:'Restore saved'}).click();
  assert.match(await page.locator('.flow-inputs').innerText(), /120 USD/);
  assert.equal(await page.locator('#comparison-targetMonthly').count(),0);
  await page.getByLabel('Estimate from usage',{exact:true}).check();
  await page.getByText('Advanced source assumptions',{exact:true}).click();
  await page.locator('#input-days').fill('28');
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  assert.match(await page.locator('.sizing-reference').innerText(), /672 h\/month/);
});
test('mobile navigation closes the drawer and focuses the new page heading', async t => {
  const page=await openCost(t,{width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.locator('#nav-otel').click();
  await page.waitForURL('**/#otel/input');
  await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-flow-heading'));
  assert.equal(await page.getByRole('button',{name:'Open navigation'}).getAttribute('aria-expanded'),'false');
});
test('export and printable report retain automatic planning uncertainty', async t => {
  const page=await openCost(t);
  await page.locator('#cost-next').click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON'}).click();
  assert.equal((await download).suggestedFilename(),'observability-plan.json');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.topbar').isVisible(),false);
  assert.equal(await page.locator('.print-report').isVisible(),true);
  assert.match(await page.locator('.print-report').innerText(),/not a validated GB-to-Fabric sizing formula/i);
});
test('vendor exports are previewed locally, switch vendor and fill inputs, and a billed total drives results', async t => {
  const page = await openCost(t);
  const csv = 'Date,TCO priority,Entity type,Ingested data (GB sent)\n2026-10-01,High,Logs,12\n2026-10-02,Low,Logs,4\n2026-10-01,High,Spans,6\n';
  await page.locator('.vendor-import input[type=file]').setInputFiles({ name: 'cx-usage.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const preview = page.locator('.import-preview');
  assert.match(await preview.innerText(), /Coralogix Data Usage Report \(CSV\)[\s\S]*8 GB\/day/);
  await page.getByRole('button', { name: 'Apply to inputs' }).click();
  assert.equal(await page.getByRole('button', { name: 'Coralogix', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#input-logsGB').inputValue(), '8');
  assert.equal(await page.locator('#input-traceGB').inputValue(), '3');
  await page.getByRole('button', { name: 'Datadog', exact: true }).click();
  const cost = { data: [{ type: 'cost_by_org', attributes: { date: '2026-10-01T00:00:00Z', total_cost: 4321, charges: [{ product_name: 'logs', charge_type: 'total', cost: 4321 }] } }] };
  await page.locator('.vendor-import input[type=file]').setInputFiles({ name: 'dd-cost.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cost)) });
  await page.getByRole('button', { name: 'Apply to inputs' }).click();
  await page.locator('#cost-next').click();
  await page.waitForURL('**/#cost/results');
  const split = await page.locator('.result-split').innerText();
  assert.match(split, /Customer monthly bill \(all-in\)/);
  assert.match(split, /4,321/);
});
