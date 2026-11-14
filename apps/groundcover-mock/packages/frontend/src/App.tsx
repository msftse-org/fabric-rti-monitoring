import { useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { DisclaimerBanner, DisclaimerFooter } from './components/Disclaimer';
import { DataGate } from './components/States';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DataProvider } from './lib/data';
import { usePersistedFlag } from './lib/hooks';
import { navigate, useRoute } from './lib/router';
import { ToastProvider } from './lib/toast';
import { resolvePage } from './pages/routes';

function Shell() {
  const route = useRoute();
  const page = resolvePage(route);
  const [collapsed, setCollapsed] = usePersistedFlag('gc-mock-nav-collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!page) navigate('workloads');
  }, [page]);

  useEffect(() => {
    setMobileOpen(false);
  }, [route.raw]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!page) return null;

  return (
    <div className={`app${collapsed ? ' app--collapsed' : ''}`}>
      <Sidebar
        route={route}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="main">
        <TopBar title={page.title} showCreateMonitor={!page.ownsCreateMonitor} onOpenMenu={() => setMobileOpen(true)} />
        <DisclaimerBanner />
        <main className="content" id="content" key={route.raw}>
          <DataGate>{page.element}</DataGate>
        </main>
        <DisclaimerFooter />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ToastProvider>
  );
}
