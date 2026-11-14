import { useMemo, useState } from 'react';
import { ChartColumn, CircleAlert, Clock, Download, Gauge, Repeat, Timer, Users } from 'lucide-react';
import { ANALYTICS_KQL, computeAnalytics, DAY, dateTime, duration, HOUR } from '@oncall';
import { BarList, DayBars } from '../components/charts';
import { Avatar, Card, CapabilityList, CodeBlock, Command, CommandBar, CounterpartLink, Disclosure, EmptyState, Kpi, Segmented, ViewHeader } from '../components/ui';
import { downloadFile } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';
import { href, paths } from '../lib/router';

type Range = '24h' | '7d' | 'all';

const pct = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);

export function Analytics() {
  const { model, lk } = useOnCall();
  const [range, setRange] = useState<Range>('7d');
  const from = range === '24h' ? model.now - DAY : range === '7d' ? model.now - 7 * DAY : Math.min(model.dataFrom, ...model.pages.map((page) => page.triggeredAt));
  const stats = useMemo(() => computeAnalytics(model, from, model.now + HOUR), [model, from]);
  const monitors = new Map(model.monitors.map((monitor) => [monitor.id, monitor]));
  const exportCsv = () => {
    const rows = [['UserId', 'Name', 'Notifications', 'OffHours', 'Acknowledgments'], ...stats.responders.map((item) => [item.userId, lk.users.get(item.userId)?.name ?? '', String(item.notifications), String(item.offHours), String(item.acknowledgments)])];
    downloadFile('oncall-responder-load.csv', rows.map((row) => row.join(',')).join('\n'), 'text/csv');
  };

  return (
    <>
      <ViewHeader eyebrow="Real-Time Dashboard · On-Call analytics" title="Analytics" actions={<CounterpartLink path="/analytics" />}>
        Volume, response times and responder load from OnCallPages and OnCallPageEvents, {dateTime(stats.from)} to {dateTime(model.now)} UTC.
      </ViewHeader>
      <CommandBar
        label="Analytics commands"
        end={
          <Segmented
            label="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: '24h', label: 'Last 24 hours' },
              { value: '7d', label: 'Last 7 days' },
              { value: 'all', label: 'All data' },
            ]}
          />
        }
      >
        <Command icon={Download} label="Export responder load" onClick={exportCsv} />
        <Command icon={CircleAlert} label="Pages" href={href(paths.pages())} />
      </CommandBar>

      <div className="kpis kpis--6">
        <Kpi icon={CircleAlert} label="Pages" value={stats.pages} hint={`${stats.high} high, ${stats.low} low`} tone="brand" />
        <Kpi icon={Timer} label="MTTA (median)" value={duration(stats.mttaMs)} hint={`${stats.acknowledged} acknowledged`} />
        <Kpi icon={Clock} label="MTTR (median)" value={duration(stats.mttrMs)} />
        <Kpi icon={Gauge} label="Acknowledged in 5 min" value={pct(stats.ackWithin5Pct)} />
        <Kpi icon={Repeat} label="Escalated" value={pct(stats.escalatedPct)} hint="Needed more than step 1" />
        <Kpi icon={Users} label="Resolved by" value={`${stats.resolvedBy.monitor} / ${stats.resolvedBy.user} / ${stats.resolvedBy.policy}`} hint="Recovery rule / person / flow" />
      </div>

      {stats.pages === 0 ? (
        <Card>
          <EmptyState icon={ChartColumn} title="No pages in this range">
            Pick a longer range.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid--main">
            <Card title="Pages per day" icon={ChartColumn} subtitle="Stacked by urgency">
              <DayBars days={stats.byDay} />
            </Card>
            <Card title="By team" icon={Users}>
              <BarList
                items={stats.byTeam.map((item) => ({
                  key: item.key,
                  label: lk.teams.get(item.key)?.name ?? item.key,
                  value: item.pages,
                  high: item.high,
                  href: href(paths.team(item.key)),
                  extra: `MTTA ${duration(item.mttaMs)}`,
                }))}
              />
            </Card>
          </div>
          <div className="grid grid--thirds">
            <Card title="By service">
              <BarList items={stats.byService.map((item) => ({ key: item.key, label: item.key, value: item.pages, high: item.high, extra: `MTTR ${duration(item.mttrMs)}` }))} />
            </Card>
            <Card title="By Activator rule">
              <BarList items={stats.byMonitor.map((item) => ({ key: String(item.monitorId), label: monitors.get(item.monitorId)?.name ?? `#${item.monitorId}`, value: item.pages, href: href(paths.rule(item.monitorId)) }))} />
            </Card>
            <Card title="Resolved by">
              <BarList
                items={[
                  { key: 'monitor', label: 'Recovery rule (Activator)', value: stats.resolvedBy.monitor },
                  { key: 'user', label: 'A responder', value: stats.resolvedBy.user },
                  { key: 'policy', label: 'Flow exhausted', value: stats.resolvedBy.policy },
                ]}
              />
            </Card>
          </div>
          <Card title="Responder load" icon={Users} flush>
            <div className="table-wrap">
              <table className="table table--cards">
                <caption className="sr-only">Responder load</caption>
                <thead>
                  <tr>
                    <th scope="col">Responder</th>
                    <th scope="col" className="num">
                      Notifications
                    </th>
                    <th scope="col" className="num">
                      Off hours
                    </th>
                    <th scope="col" className="num">
                      Acknowledgments
                    </th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.responders.map((item) => {
                    const user = lk.users.get(item.userId);
                    const max = Math.max(1, ...stats.responders.map((row) => row.notifications));
                    return (
                      <tr key={item.userId}>
                        <td data-label="Responder">
                          <span className="person">
                            <Avatar user={user} size={24} />
                            <span className="person__text">
                              <span className="person__name">{user?.name ?? item.userId}</span>
                              <span className="person__sub">{user?.teamIds.map((teamId) => lk.teams.get(teamId)?.name).join(', ')}</span>
                            </span>
                          </span>
                        </td>
                        <td data-label="Notifications" className="num">
                          {item.notifications}
                        </td>
                        <td data-label="Off hours" className="num">
                          {item.offHours}
                        </td>
                        <td data-label="Acknowledgments" className="num">
                          {item.acknowledgments}
                        </td>
                        <td data-label="Share">
                          <span className="meter" aria-hidden>
                            <span style={{ width: `${(item.notifications / max) * 100}%` }} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card title="Built on Fabric data" icon={Gauge} subtitle="Each tile is a Real-Time Dashboard query over the Eventhouse">
        <CodeBlock code={ANALYTICS_KQL} title="Real-Time Dashboard · MTTA and MTTR by team" />
        <Disclosure summary="What the tiles show" icon={ChartColumn}>
          <p className="small">MTTA and MTTR are medians over pages triggered in the range. "Off hours" counts notifications sent before 08:00 or after 20:00 in the responder's time zone.</p>
        </Disclosure>
        <CapabilityList ids={['analytics']} />
      </Card>
    </>
  );
}
