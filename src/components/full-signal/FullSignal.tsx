"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Landing from './Landing';
import BrandMark from './BrandMark';
import Cabinet from './Cabinet';
import Dossier from './Dossier';
import Processing from './Processing';
import styles from './FullSignal.module.css';

type Route = { page: 'landing' | 'processing' | 'cabinet' } | { page: 'dossier'; id: string };

function readHash() {
  return window.location.hash;
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('dossier/')) {
    return { page: 'dossier', id: path.slice('dossier/'.length) };
  }
  if (path === 'cabinet' || path === 'processing') return { page: path };
  return { page: 'landing' };
}

function navigate(path: string) {
  window.location.hash = `/${path}`;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export default function FullSignal() {
  const hash = useSyncExternalStore(subscribe, readHash, () => '');
  const route = routeFromHash(hash);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<string[]>([]);

  const dossierId = route.page === 'dossier' ? route.id : '';

  useEffect(() => {
    if (route.page !== 'dossier') return;
    document.getElementById('dossier-heading')?.focus();
  }, [route.page, dossierId]);

  const handleStart = (nextQuery: string, nextFiles: string[]) => {
    setQuery(nextQuery);
    setFiles(nextFiles);
    navigate('processing');
  };
  const handleComplete = useCallback(() => {
    navigate('cabinet');
  }, []);
  const openDossier = (id: string) => {
    navigate(`dossier/${id}`);
  };

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
      <header className={styles.header}>
        <button className={styles.brand} onClick={() => navigate('')} aria-label="All Signal home">
          <BrandMark />
        </button>
        <nav className={styles.navigation} aria-label="Main navigation">
          <button className={route.page === 'landing' ? styles.activeNav : ''} onClick={() => navigate('')}>New research</button>
          <button className={route.page === 'cabinet' || route.page === 'dossier' ? styles.activeNav : ''} onClick={() => navigate('cabinet')}>The cabinet <span>06</span></button>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <div hidden={route.page !== 'landing'}><Landing onStart={handleStart} /></div>
        {route.page === 'processing' && <Processing query={query} files={files} onComplete={handleComplete} onCancel={() => navigate('')} />}
        <div hidden={route.page !== 'cabinet'}><Cabinet query={query} onOpen={openDossier} onNewSearch={() => navigate('')} /></div>
        {route.page === 'dossier' && <Dossier key={route.id} id={route.id} onBack={() => navigate('cabinet')} onOpen={openDossier} />}
      </main>

    </div>
  );
}
