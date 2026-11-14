import { Bell, Copy, LayoutDashboard, RotateCcw, Save } from 'lucide-react';
import { href, navigate, paths } from '../lib/router';
import { useToast } from '../lib/toast';
import { Segmented } from './Controls';
import { SavedViewsMenu, type SavedView } from './SavedViewsMenu';
import { TimeControls } from './TimeControls';

type Dataset = 'logs' | 'tracing';

interface ExploreHeaderProps {
  dataset: Dataset;
  views: SavedView[];
  query: string;
  onPickView: (query: string) => void;
  onReset: () => void;
}

/** Explore title row: dataset switch, saved views, toolbar actions and the time controls. */
export function ExploreHeader({ dataset, views, query, onPickView, onReset }: ExploreHeaderProps) {
  const { inert, notify } = useToast();
  const copyUrl = () => void navigator.clipboard?.writeText(window.location.href).then(() => notify('Link copied to clipboard'));

  return (
    <header className="page-head explore-head">
      <div className="page-head-title">
        <h1>Explore</h1>
        <SavedViewsMenu views={views} active={query} onPick={onPickView} />
        <Segmented<Dataset>
          ariaLabel="Dataset"
          value={dataset}
          onChange={(next) => navigate(next === 'logs' ? paths.logs() : paths.tracing())}
          options={[
            { id: 'logs', label: 'Logs' },
            { id: 'tracing', label: 'Spans' },
          ]}
        />
      </div>
      <div className="page-head-row">
        <nav className="tabs" aria-label="Explore tabs">
          <a className="tab is-active" aria-current="page" href={href(dataset === 'logs' ? paths.logs() : paths.tracing())}>
            Explore 1
          </a>
        </nav>
        <div className="explore-actions">
          <button type="button" className="link-btn" onClick={copyUrl}>
            <Copy size={13} aria-hidden /> Copy URL
          </button>
          <button type="button" className="link-btn" onClick={inert}>
            <Bell size={13} aria-hidden /> Create alert
          </button>
          <button type="button" className="link-btn" onClick={inert}>
            <LayoutDashboard size={13} aria-hidden /> Save to dashboard
          </button>
          <button type="button" className="link-btn" onClick={onReset}>
            <RotateCcw size={13} aria-hidden /> Reset
          </button>
          <button type="button" className="link-btn" onClick={inert}>
            <Save size={13} aria-hidden /> Save view
          </button>
          <TimeControls />
        </div>
      </div>
    </header>
  );
}
