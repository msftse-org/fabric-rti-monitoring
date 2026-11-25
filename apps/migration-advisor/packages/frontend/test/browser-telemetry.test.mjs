import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserTelemetry } from '../src/browserTelemetry.ts';

function harness() {
  const listeners = new Map();
  const calls = { configs: [], views: [], events: [], initializers: [] };
  const platform = {
    location: { origin: 'https://advisor.example', hash: '#cost/results?invoice=secret' },
    document: { readyState: 'complete' },
    performance: {
      getEntriesByType: type => type === 'navigation' ? [{ loadEventEnd: 1234 }] : [],
      getEntriesByName: name => name === 'first-contentful-paint' ? [{ startTime: 450 }] : [],
    },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
  };
  const createClient = async config => {
    calls.configs.push(config);
    return {
      loadAppInsights() {},
      addTelemetryInitializer(callback) { calls.initializers.push(callback); },
      trackPageView(view) { calls.views.push(view); },
      trackEvent(event) { calls.events.push(event); },
    };
  };
  const dispatch = type => { for (const handler of listeners.get(type) ?? []) handler(); };
  return { calls, platform, createClient, dispatch };
}

test('without an explicit connection string the SDK is never created and nothing is sent', async () => {
  const h = harness();
  await startBrowserTelemetry({ connectionString: '  ', platform: h.platform, createClient: h.createClient });
  h.dispatch('hashchange');
  assert.deepEqual(h.calls.configs, []);
  assert.deepEqual(h.calls.views, []);
  assert.deepEqual(h.calls.events, []);
});

test('opt-in disables automatic sensitive collection and captures only canonical hash routes and timings', async () => {
  const h = harness();
  const stop = await startBrowserTelemetry({ connectionString: 'InstrumentationKey=example', platform: h.platform, createClient: h.createClient });
  const config = h.calls.configs[0];
  assert.equal(config.disableAjaxTracking, true);
  assert.equal(config.disableFetchTracking, true);
  assert.equal(config.disableExceptionTracking, true);
  assert.equal(config.enableAutoRouteTracking, false);
  assert.equal(config.disableCookiesUsage, true);
  assert.equal(config.isStorageUseDisabled, true);
  assert.equal(config.enableSessionStorageBuffer, false);
  assert.equal(config.extensionConfig.AppInsightsCfgSyncPlugin.blkCdnCfg, true);
  assert.equal(config.extensionConfig.AppInsightsCfgSyncPlugin.syncMode, 0);
  assert.equal(config.featureOptIn.SdkStats.mode, 2);
  assert.equal(config.featureOptIn.sdkStats.mode, 2);
  // The actual router treats a query embedded in the step as an input route.
  assert.deepEqual(h.calls.views, [{ name: 'Cost comparison · inputs', uri: 'https://advisor.example/#cost/input' }]);
  assert.deepEqual(h.calls.events, [{
    name: 'Browser navigation timing',
    measurements: { navigationLoadMs: 1234, firstContentfulPaintMs: 450 },
  }]);

  h.platform.location.hash = '#cost/input?another=private';
  h.dispatch('hashchange');
  h.dispatch('popstate');
  assert.equal(h.calls.views.length, 1);
  h.platform.location.hash = '#cost/results';
  h.dispatch('hashchange');
  assert.equal(h.calls.views.at(-1).uri, 'https://advisor.example/#cost/results');
  h.platform.location.hash = '#otel/input?token=private';
  h.dispatch('hashchange');
  assert.equal(h.calls.views.at(-1).uri, 'https://advisor.example/#otel/input');
  assert.doesNotMatch(JSON.stringify(h.calls), /invoice|secret|another|token|private/);
  stop();
  h.platform.location.hash = '#sources';
  h.dispatch('hashchange');
  assert.equal(h.calls.views.length, 3);
});

test('privacy initializer drops unexpected telemetry and strips properties, query strings and referrers', async () => {
  const h = harness();
  await startBrowserTelemetry({ connectionString: 'InstrumentationKey=example', platform: h.platform, createClient: h.createClient });
  const filter = h.calls.initializers[0];
  assert.equal(filter({ baseType: 'RemoteDependencyData', baseData: { data: 'invoice content' } }), false);
  assert.equal(filter({ baseType: 'ExceptionData', baseData: { message: 'secret' } }), false);
  assert.equal(filter({ baseType: 'EventData', baseData: { name: 'secret' } }), false);
  assert.equal(filter({ baseType: 'MetricData', baseData: { name: 'secret' } }), false);
  assert.equal(filter({ baseType: 'PageviewData', baseData: { name: 'toString' } }), false);
  const page = {
    baseType: 'PageviewData',
    baseData: { name: 'Cost comparison · results', uri: 'https://advisor.example/private?invoice=secret', properties: { content: 'secret' } },
    data: { invoice: 'secret' },
    ext: { web: { refUri: 'https://other.example/?token=secret' } },
  };
  assert.notEqual(filter(page), false);
  assert.equal(page.baseData.uri, 'https://advisor.example/#cost/results');
  assert.doesNotMatch(JSON.stringify(page), /invoice|secret|token|refUri/);
  const timing = { baseType: 'EventData', baseData: { name: 'Browser navigation timing', measurements: { navigationLoadMs: 123, invoice: 999 }, properties: { note: 'secret' } } };
  assert.notEqual(filter(timing), false);
  assert.deepEqual(timing.baseData.measurements, { navigationLoadMs: 123 });
  assert.doesNotMatch(JSON.stringify(timing), /invoice|secret/);
});
