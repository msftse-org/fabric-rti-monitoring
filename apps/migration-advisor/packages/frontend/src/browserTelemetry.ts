import type { ApplicationInsights, IConfig, IConfiguration, ITelemetryItem } from '@microsoft/applicationinsights-web';
import { parseFlowRoute, routeHash } from './flow.ts';

type BrowserPlatform = Pick<Window, 'location' | 'document' | 'performance' | 'addEventListener' | 'removeEventListener'>;
type Client = Pick<ApplicationInsights, 'loadAppInsights' | 'addTelemetryInitializer' | 'trackPageView' | 'trackEvent'>;
type SdkConfig = IConfiguration & IConfig;

const pageNames: Record<string, string> = {
  '#map': 'Migration map',
  '#sources': 'Sources & scope',
  '#cost/input': 'Cost comparison · inputs',
  '#cost/results': 'Cost comparison · results',
  '#otel/input': 'OTel configuration · inputs',
  '#otel/results': 'OTel configuration · results',
};
const pagePaths = Object.fromEntries(Object.entries(pageNames).map(([path, name]) => [name, path]));
const timingEvent = 'Browser navigation timing';
const timingKeys = ['navigationLoadMs', 'firstContentfulPaintMs'] as const;

function originOnly(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  } catch { /* A file or opaque origin has no shareable site URL. */ }
  return 'https://local.invalid';
}

/**
 * Allow only our fixed page names and two numeric timing measurements. Rebuild
 * the payload instead of attempting to redact unknown fields. SDK context,
 * referrers, custom properties, and every other telemetry type are discarded.
 * The SDK may otherwise continue sending an item if an initializer throws, so
 * malformed payloads fail closed.
 */
function privacyFilter(item: ITelemetryItem, origin: string): boolean {
  try {
    const data = item.baseData;
    if (!data || typeof data !== 'object') return false;
    if (item.baseType === 'PageviewData') {
      const path = typeof data.name === 'string' && Object.hasOwn(pagePaths, data.name) ? pagePaths[data.name] : undefined;
      if (!path) return false;
      item.name = 'Microsoft.ApplicationInsights.{0}.Pageview';
      item.baseData = { name: data.name, uri: `${origin}/${path}` };
    } else if (item.baseType === 'EventData' && data.name === timingEvent) {
      const measurements: Record<string, number> = {};
      for (const key of timingKeys) {
        const value = data.measurements?.[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400000)
          measurements[key] = value;
      }
      if (!Object.keys(measurements).length) return false;
      item.name = 'Microsoft.ApplicationInsights.{0}.Event';
      item.baseData = { name: timingEvent, measurements };
    } else return false;
    delete item.ext;
    delete item.tags;
    delete item.data;
    return true;
  } catch {
    return false;
  }
}

function sdkConfiguration(connectionString: string): SdkConfig {
  return {
    connectionString,
    disableAjaxTracking: true,
    disableFetchTracking: true,
    disableExceptionTracking: true,
    enableUnhandledPromiseRejectionTracking: false,
    enableAutoRouteTracking: false,
    autoTrackPageVisitTime: false,
    disableCorrelationHeaders: true,
    enableRequestHeaderTracking: false,
    enableResponseHeaderTracking: false,
    enableAjaxErrorStatusText: false,
    disableCookiesUsage: true,
    isStorageUseDisabled: true,
    enableSessionStorageBuffer: false,
    loggingLevelTelemetry: 0,
    // Prevent remotely supplied configuration or SDK stats from weakening the
    // privacy settings or producing additional, unreviewed telemetry.
    extensionConfig: { AppInsightsCfgSyncPlugin: { blkCdnCfg: true, syncMode: 0 } },
    featureOptIn: { SdkStats: { mode: 2 }, sdkStats: { mode: 2 } },
  };
}

/**
 * Opt-in only: fixed hash-route page views and one numeric navigation/FCP
 * timing event, exported as AppPageViews and AppEvents. No form/file contents,
 * request/dependency data, exception details, query strings, or referrers are
 * collected. Cookies, SDK storage, remote configuration, and SDK stats are off.
 * Azure still receives the network connection's IP address and user agent.
 * The Vite connection string is public in the browser bundle, not a secret.
 */
export async function startBrowserTelemetry({
  connectionString,
  platform = window,
  createClient = async config => {
    const { ApplicationInsights } = await import('@microsoft/applicationinsights-web');
    return new ApplicationInsights({ config });
  },
}: {
  connectionString?: string;
  platform?: BrowserPlatform;
  createClient?: (config: SdkConfig) => Promise<Client>;
}): Promise<() => void> {
  const value = connectionString?.trim();
  if (!value) return () => {};
  const origin = originOnly(platform.location.origin);
  let client: Client;
  try {
    client = await createClient(sdkConfiguration(value));
    // Install the filter before SDK startup, including any internal telemetry.
    client.addTelemetryInitializer(item => privacyFilter(item, origin));
    client.loadAppInsights();
  } catch {
    console.warn('Optional browser telemetry could not be initialized.');
    return () => {};
  }

  let active = true;
  let lastPath = '';
  const onRoute = () => {
    if (!active) return;
    // Use the same parser as the app and construct a fresh, allowlisted URI.
    const path = routeHash(parseFlowRoute(platform.location.hash));
    if (path === lastPath) return;
    lastPath = path;
    client.trackPageView({ name: pageNames[path], uri: `${origin}/${path}` });
  };
  const recordTiming = () => {
    if (!active) return;
    try {
      const navigation = platform.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paint = platform.performance.getEntriesByName('first-contentful-paint')[0];
      const measurements: Record<string, number> = {};
      if (navigation && Number.isFinite(navigation.loadEventEnd) && navigation.loadEventEnd > 0)
        measurements.navigationLoadMs = navigation.loadEventEnd;
      if (paint && Number.isFinite(paint.startTime) && paint.startTime >= 0)
        measurements.firstContentfulPaintMs = paint.startTime;
      if (Object.keys(measurements).length) client.trackEvent({ name: timingEvent, measurements });
    } catch { /* Performance APIs are optional and must not affect the advisor. */ }
  };
  const onLoad = () => { setTimeout(recordTiming, 0); };
  platform.addEventListener('hashchange', onRoute);
  platform.addEventListener('popstate', onRoute);
  onRoute();
  if (platform.document.readyState === 'complete') recordTiming();
  else platform.addEventListener('load', onLoad, { once: true });

  return () => {
    active = false;
    platform.removeEventListener('hashchange', onRoute);
    platform.removeEventListener('popstate', onRoute);
    platform.removeEventListener('load', onLoad);
  };
}
