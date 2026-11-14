import { useMemo, useState } from 'react';
import { Download, Plus, Search, UserCheck } from 'lucide-react';
import { dateTime, type Page, type PageStatus, type Urgency } from '@oncall';
import { NewPageDialog } from '../components/dialogs';
import { PageTable } from '../components/oncall';
import { Card, CodeBlock, Command, CommandBar, CounterpartLink, Disclosure, Segmented, SupportBadge, ViewHeader } from '../components/ui';
import { capability, downloadFile } from '../lib/fabric';
import { useOnCall } from '../lib/oncall';

type StatusFilter = 'all' | PageStatus;
type UrgencyFilter = 'all' | Urgency;

function listKql(status: StatusFilter, urgency: UrgencyFilter, teamId: string, mine: boolean, me: string) {
  const where = [
    status !== 'all' ? `Status == '${status}'` : null,
    urgency !== 'all' ? `Urgency == '${urgency}'` : null,
    teamId !== 'all' ? `TeamId == '${teamId}'` : null,
    mine ? `Responders has '${me}'` : null,
  ].filter(Boolean);
  return `OnCallPages
| join kind=inner (
    OnCallPageEvents
    | summarize Acked = countif(Kind == 'acknowledged'), Resolved = countif(Kind == 'resolved'),
                Responders = make_set(Users) by PageId
  ) on PageId
| extend Status = iff(Resolved > 0, 'resolved', iff(Acked > 0, 'acknowledged', 'triggered'))${where.length ? `\n| where ${where.join(' and ')}` : ''}
| order by TriggeredAt desc`;
}

function toCsv(pages: Page[]) {
  const rows = [['PageId', 'Status', 'Urgency', 'Title', 'TeamId', 'Service', 'TriggeredAt', 'AcknowledgedAt', 'ResolvedAt', 'Responders']];
  for (const page of pages) {
    rows.push([
      String(page.id),
      page.status,
      page.urgency,
      page.title,
      page.teamId,
      page.service ?? '',
      new Date(page.triggeredAt).toISOString(),
      page.acknowledgedAt ? new Date(page.acknowledgedAt).toISOString() : '',
      page.resolvedAt ? new Date(page.resolvedAt).toISOString() : '',
      page.responderIds.join(' '),
    ]);
  }
  return rows.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');
}

export function PagesList({ q }: { q: string }) {
  const { model, lk, now } = useOnCall();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [urgency, setUrgency] = useState<UrgencyFilter>('all');
  const [teamId, setTeamId] = useState('all');
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState(q);
  const [creating, setCreating] = useState(false);
  const me = model.currentUserId;

  const base = useMemo(() => {
    const text = query.trim().toLowerCase().replace(/^#/, '');
    return model.pages.filter((page) => {
      if (urgency !== 'all' && page.urgency !== urgency) return false;
      if (teamId !== 'all' && page.teamId !== teamId) return false;
      if (mine && !page.responderIds.includes(me) && page.acknowledgedBy !== me) return false;
      if (!text) return true;
      const team = lk.teams.get(page.teamId);
      return String(page.id).includes(text) || page.title.toLowerCase().includes(text) || (page.service ?? '').includes(text) || (team?.name.toLowerCase().includes(text) ?? false);
    });
  }, [model.pages, urgency, teamId, mine, me, query, lk]);
  const pages = status === 'all' ? base : base.filter((page) => page.status === status);
  const count = (value: PageStatus) => base.filter((page) => page.status === value).length;
  const cap = capability('timeline');

  return (
    <>
      <ViewHeader eyebrow="Activator alerts" title="Pages" actions={<CounterpartLink path="/pages" />}>
        Every page raised by an Activator rule or by hand, from {dateTime(model.dataFrom)} to {dateTime(now)} UTC.
      </ViewHeader>
      <CommandBar label="Page commands" end={cap && <SupportBadge support={cap.support} />}>
        <Command icon={Plus} label="New page" primary onClick={() => setCreating(true)} />
        <Command icon={Download} label="Export CSV" onClick={() => downloadFile('oncall-pages.csv', toCsv(pages), 'text/csv')} />
      </CommandBar>

      <div className="filters" role="search" aria-label="Filter pages">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: base.length },
            { value: 'triggered', label: 'Triggered', count: count('triggered') },
            { value: 'acknowledged', label: 'Acknowledged', count: count('acknowledged') },
            { value: 'resolved', label: 'Resolved', count: count('resolved') },
          ]}
        />
        <label className="filter">
          <span>Urgency</span>
          <select className="select select--sm" value={urgency} onChange={(event) => setUrgency(event.target.value as UrgencyFilter)}>
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="filter">
          <span>Team</span>
          <select className="select select--sm" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="all">All teams</option>
            {model.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="toggle" aria-pressed={mine} onClick={() => setMine((value) => !value)}>
          <UserCheck size={14} aria-hidden />
          My pages
        </button>
        <label className="filter filter--search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Search</span>
          <input className="input input--sm" type="search" value={query} placeholder="Number, title, service or team" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <Card flush>
        <div className="table-meta" aria-live="polite">
          {pages.length} of {model.pages.length} pages
        </div>
        <PageTable pages={pages} caption="Pages" empty="No pages match these filters" />
      </Card>

      <Disclosure summary="The same list as KQL over the Eventhouse">
        <CodeBlock code={listKql(status, urgency, teamId, mine, me)} title="KQL queryset · oncall" note="OnCallPages and OnCallPageEvents are written by the paging flow and by this app." />
      </Disclosure>
      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </>
  );
}
