import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '../../lib/prefs';
import type { Route } from '../../lib/router';
import { DisclaimerBanner, FooterStrip } from './Disclaimer';
import { Rail } from './Rail';
import { TopBar } from './TopBar';

export function AppShell({ route, hash, children }: { route: Route; hash: string; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setNavOpen(false);
    contentRef.current?.scrollTo(0, 0);
  }, [route.name, hash.split('?')[0]]);

  return (
    <div className="app">
      <DisclaimerBanner />
      <div className="app__body">
        <Rail route={route} open={navOpen} onClose={() => setNavOpen(false)} theme={theme} onToggleTheme={toggleTheme} />
        <div className="main">
          <TopBar route={route} onMenu={() => setNavOpen(true)} />
          <main className="content" ref={contentRef} id="content">
            {children}
          </main>
          <FooterStrip />
        </div>
      </div>
    </div>
  );
}
