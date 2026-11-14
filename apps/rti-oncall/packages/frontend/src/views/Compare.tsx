import { useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, ExternalLink, GitCompareArrows, Scale } from 'lucide-react';
import { CAPABILITIES, counterpartUrl, duration, SUPPORT_LABEL, type Capability, type Page, type Support } from '@oncall';
import { ActorChip, NotifiedList } from '../components/oncall';
import { Artifact, Card, CounterpartLink, Crumbs, EmptyState, LinkButton, Segmented, StatusBadge, SupportBadge, TimeAgo, UrgencyBadge, ViewHeader } from '../components/ui';
import { capability, describeDatadog, describeFabric, SUPPORT_ORDER } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { datadogUrl, href, navigate, paths } from '../lib/router';

type SupportFilter = 'all' | Support;

function pickable(pages: Page[]) {
  const open = pages.filter((page) => page.status !== 'resolved').sort((a, b) => (a.status === b.status ? b.triggeredAt - a.triggeredAt : a.status === 'triggered' ? -1 : 1));
  const resolved = pages.filter((page) => page.status === 'resolved').slice(0, 6);
  return [...open, ...resolved];
}

function PagePicker({ current }: { current?: number }) {
  const { model } = useOnCall();
  const options = pickable(model.pages);
  const value = current ?? options[0]?.id;
  return (
    <label className="filter">
      <span>Page</span>
      <select className="select select--sm" value={value} onChange={(event) => navigate(paths.comparePage(Number(event.target.value)))}>
        {options.map((page) => (
          <option key={page.id} value={page.id}>
            #{page.id} · {page.status} · {page.title.slice(0, 48)}
          </option>
        ))}
        {current !== undefined && !options.some((page) => page.id === current) && <option value={current}>#{current}</option>}
      </select>
    </label>
  );
}

function MatrixRow({ item }: { item: Capability }) {
  const ddUrl = counterpartUrl('datadog', item.datadog.path, import.meta.env.DEV);
  return (
    <tr className={item.support === 'gap' ? 'row--gap' : undefined}>
      <td data-label="Area" className="cell-area">
        {item.area}
      </td>
      <td data-label="Datadog On-Call">
        <strong>{item.datadog.feature}</strong>
        <span className="cell-sub">{item.datadog.detail}</span>
      </td>
      <td data-label="Fabric RTI">
        <strong>{item.rti.feature}</strong>
        <span className="cell-sub">{item.rti.detail}</span>
        {item.rti.items.length > 0 && (
          <span className="chips chips--artifacts">
            {item.rti.items.map((name) => (
              <Artifact key={name} name={name} />
            ))}
          </span>
        )}
      </td>
      <td data-label="Support">
        <SupportBadge support={item.support} />
      </td>
      <td data-label="Open" className="cell-links">
        <a href={href(item.rti.path)}>
          This app <ArrowRight size={12} aria-hidden />
        </a>
        {ddUrl && (
          <a href={ddUrl} target="_blank" rel="noreferrer">
            Datadog mock <ExternalLink size={12} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </td>
    </tr>
  );
}

export function Compare() {
  const { model, now } = useOnCall();
  const [filter, setFilter] = useState<SupportFilter>('all');
  const rows = CAPABILITIES.filter((item) => filter === 'all' || item.support === filter);
  const count = (support: Support) => CAPABILITIES.filter((item) => item.support === support).length;
  const featured = pickable(model.pages).slice(0, 4);

  return (
    <>
      <ViewHeader eyebrow="Datadog On-Call vs Fabric Real-Time Intelligence" title="Compare with Datadog" actions={<CounterpartLink path="/compare" label="Open Datadog On-Call" />}>
        Every Datadog On-Call capability and how this app delivers it with Fabric. Support levels are conservative; gaps stay in the list.
      </ViewHeader>

      <Card title="Compare one page, event by event" icon={GitCompareArrows} subtitle="The same page number, responders and timestamps in both apps">
        <ul className="pick">
          {featured.map((page) => (
            <li key={page.id}>
              <a href={href(paths.comparePage(page.id))} className="pick__item">
                <span className="pick__top">
                  <StatusBadge status={page.status} />
                  <UrgencyBadge urgency={page.urgency} />
                </span>
                <strong>
                  #{page.id} {page.title}
                </strong>
                <span className="muted small">
                  {page.source === 'manual' ? 'Manual page' : 'Activator rule'} · <TimeAgo at={page.triggeredAt} now={now} /> · {page.events.length} events
                </span>
                <span className="pick__go">
                  Compare <ArrowLeftRight size={14} aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="pick__more">
          <PagePicker />
        </div>
      </Card>

      <div className="parity-strip">
        {SUPPORT_ORDER.map((support) => (
          <div key={support} className={`parity-tile parity-tile--${support}`}>
            <SupportBadge support={support} />
            <span className="parity-tile__n">{count(support)}</span>
            <span className="muted small">of {CAPABILITIES.length} capabilities</span>
          </div>
        ))}
      </div>

      <Card
        title="Capability matrix"
        icon={Scale}
        flush
        actions={
          <Segmented
            label="Support level"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all' as SupportFilter, label: 'All', count: CAPABILITIES.length }, ...SUPPORT_ORDER.map((support) => ({ value: support as SupportFilter, label: SUPPORT_LABEL[support], count: count(support) }))]}
          />
        }
      >
        <div className="table-wrap">
          <table className="table table--cards table--matrix">
            <caption className="sr-only">Datadog On-Call capabilities and their Fabric equivalents</caption>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Datadog On-Call</th>
                <th scope="col">Fabric RTI approach</th>
                <th scope="col">Support</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <MatrixRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

const CONCEPTS: [string, string][] = [
  ['Monitor', 'Activator rule on a KQL queryset'],
  ['Routing rule', 'OnCallRouting row, matched by the flow'],
  ['Escalation policy', 'Power Automate flow'],
  ['Page', 'Activator alert, a row in OnCallPages'],
  ['Push / SMS / voice', 'Teams card, Outlook, SMS and voice via ACS'],
  ['Ack in the mobile app', 'Ack on the Teams adaptive card or in this app'],
];

export function ComparePage({ pageId }: { pageId: number }) {
  const onCall = useOnCall();
  const { model, lk, now } = onCall;
  const page = model.pages.find((item) => item.id === pageId);
  const rows = useMemo(() => {
    if (!page) return [];
    const ctx = { page, model, lk, byViewer: (kind: 'ack' | 'resolve', at: number) => onCall.byViewer(page.id, kind, at) };
    return page.events.map((event) => ({ event, datadog: describeDatadog(event, ctx), fabric: describeFabric(event, ctx) }));
  }, [page, model, lk, onCall]);

  if (!page) {
    return (
      <>
        <Crumbs items={[{ label: 'Compare with Datadog', to: paths.compare() }, { label: `#${pageId}` }]} />
        <EmptyState icon={GitCompareArrows} title={`Page #${pageId} is not in this data`}>
          Pick another page. <PagePicker />
        </EmptyState>
      </>
    );
  }
  const ddUrl = datadogUrl(paths.comparePage(page.id));
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

  return (
    <>
      <Crumbs items={[{ label: 'Compare with Datadog', to: paths.compare() }, { label: `#${page.id}` }]} />
      <ViewHeader
        eyebrow={`Page #${page.id}, side by side`}
        title={page.title}
        actions={
          <>
            <PagePicker current={page.id} />
          </>
        }
      >
        <StatusBadge status={page.status} />
        <UrgencyBadge urgency={page.urgency} />
        <span className="muted">
          {lk.teams.get(page.teamId)?.name} · triggered <TimeAgo at={page.triggeredAt} now={now} /> · {page.events.length} events
        </span>
      </ViewHeader>

      <div className="vs-head">
        <div className="vs-head__col vs-head__col--dd">
          <span className="vs-head__mark" aria-hidden>
            DD
          </span>
          <div>
            <strong>Datadog On-Call</strong>
            <span className="muted small">Monitor, routing rule, escalation policy, mobile app</span>
          </div>
          {ddUrl && (
            <LinkButton href={ddUrl} target="_blank" rel="noreferrer" size="sm" icon={<ExternalLink size={14} aria-hidden />}>
              Open in Datadog mock<span className="sr-only"> (opens in a new tab)</span>
            </LinkButton>
          )}
        </div>
        <div className="vs-head__col vs-head__col--rti">
          <span className="vs-head__mark vs-head__mark--rti" aria-hidden>
            RTI
          </span>
          <div>
            <strong>Fabric Real-Time Intelligence</strong>
            <span className="muted small">Activator rule, Power Automate flow, Teams adaptive card</span>
          </div>
          <LinkButton href={href(paths.page(page.id))} size="sm" variant="primary" icon={<ArrowRight size={14} aria-hidden />}>
            Open in this app
          </LinkButton>
        </div>
      </div>

      <Card flush>
        <table className="vs">
          <caption className="sr-only">Lifecycle of page #{page.id} in Datadog On-Call and Fabric RTI, aligned by time</caption>
          <thead>
            <tr>
              <th scope="col" className="vs__time">
                Time (UTC)
              </th>
              <th scope="col">Datadog On-Call</th>
              <th scope="col">Fabric RTI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ event, datadog, fabric }, index) => {
              const cap = fabric.capabilityId ? capability(fabric.capabilityId) : undefined;
              return (
                <tr key={`${event.at}-${event.kind}-${index}`} className={`vs__row vs__row--${event.kind}`}>
                  <th scope="row" className="vs__time">
                    <time dateTime={new Date(event.at).toISOString()}>{timeFormat.format(event.at)}</time>
                    <span className="muted small">{event.at === page.triggeredAt ? 'T+0' : `T+${duration(event.at - page.triggeredAt)}`}</span>
                  </th>
                  <td className="vs__cell vs__cell--dd" data-label="Datadog On-Call">
                    <ActorChip described={datadog} />
                    <div className="vs__title">{datadog.title}</div>
                    {datadog.detail && <div className="vs__detail">{datadog.detail}</div>}
                    {datadog.notified && <NotifiedList items={datadog.notified} />}
                  </td>
                  <td className="vs__cell vs__cell--rti" data-label="Fabric RTI">
                    <ActorChip described={fabric} />
                    <div className="vs__title">{fabric.title}</div>
                    {fabric.detail && <div className="vs__detail">{fabric.detail}</div>}
                    {fabric.notified && <NotifiedList items={fabric.notified} />}
                    {cap && (
                      <div className="vs__cap">
                        <SupportBadge support={cap.support} compact />
                        <a href={href(paths.compare())}>{cap.rti.feature}</a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Same concept, two vocabularies" icon={ArrowLeftRight}>
        <dl className="concepts">
          {CONCEPTS.map(([dd, rti]) => (
            <div key={dd} className="concepts__row">
              <dt>{dd}</dt>
              <dd>
                <ArrowRight size={14} aria-hidden />
                {rti}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
