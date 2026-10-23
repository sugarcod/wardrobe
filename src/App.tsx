import { useEffect, useRef, useState } from 'react';
import { UIProvider } from './ui';
import { StoreProvider, useStore } from './store';
import { CloudProvider } from './cloud';
import { AccountBadge } from './components/Account';
import { AppCtx, useHashRoute, type DiaryInit, type Route } from './nav';
import { DiaryEntryDialog } from './components/DiaryEntryDialog';
import { DiaryScreen } from './screens/DiaryScreen';
import { PerfumesScreen } from './screens/PerfumesScreen';
import { UploadDialog } from './components/UploadDialog';
import { ItemDetail } from './components/ItemDetail';
import { WardrobeScreen } from './screens/WardrobeScreen';
import { BuilderScreen } from './screens/BuilderScreen';
import { SuggestScreen } from './screens/SuggestScreen';
import { OutfitsScreen } from './screens/OutfitsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { Item } from './types';

/** more — на телефоне раздел уходит в лист «Ещё» */
const NAV: { id: Route; label: string; more?: boolean; iconOnly?: boolean; icon: React.ReactNode }[] = [
  { id: 'wardrobe', label: 'Гардероб', icon: <path d="M12 6a2 2 0 1 1 2-2M12 6v1.5L3.5 14a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 7.5" /> },
  { id: 'builder', label: 'Образ', icon: <><circle cx="12" cy="4.5" r="2" /><path d="M8 9l1.5-2h5L16 9l-1 5h-6zM9.5 14l-.5 7M14.5 14l.5 7" /></> },
  { id: 'diary', label: 'Дневник', icon: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /><circle cx="12" cy="15" r="1.2" /></> },
  { id: 'perfumes', label: 'Парфюмы', icon: <><path d="M10 3h4v3h-4zM9.5 6h5" /><rect x="6" y="8" width="12" height="13" rx="3" /><path d="M9 14h6" /></> },
  { id: 'outfits', label: 'Образы', more: true, icon: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></> },
  { id: 'suggest', label: 'Что надеть?', more: true, icon: <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /> },
  { id: 'settings', label: 'Настройки', more: true, iconOnly: true, icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></> },
];

const NavIcon = ({ children }: { children: React.ReactNode }) => (
  <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

function Shell() {
  const { items, wearItem, draft } = useStore();
  const [route, navigate] = useHashRoute(items.length ? 'builder' : 'wardrobe');
  const [uploadFiles, setUploadFiles] = useState<File[] | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [diaryInit, setDiaryInit] = useState<DiaryInit | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const startUpload = (files: File[]) => files.length && setUploadFiles(files);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) setUploadFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const openItem = (it: Item) => setOpenItemId(it.id);
  const detailItem = openItemId ? items.find((i) => i.id === openItemId) : undefined;
  const recordDiary = (init: DiaryInit) => {
    // из конструктора — снимок текущего манекена и аромата
    if (init.source === 'builder' && !init.layers) init = { ...init, layers: draft.layers, perfumeIds: draft.perfumeIds ?? [], outfitId: draft.editingId ?? undefined };
    setDiaryInit(init);
  };
  const go = (r: Route) => { setMoreOpen(false); navigate(r); };
  const actions = { navigate: go, startUpload, pickFiles: () => fileRef.current?.click(), openItem, recordDiary };
  const moreActive = NAV.some((n) => n.more && n.id === route);

  return (
    <AppCtx.Provider value={actions}>
      <div className={`app route-${route}`}>
        <header className="topbar">
          <a className="brand" href="#/wardrobe" onClick={(e) => { e.preventDefault(); navigate('wardrobe'); }}>
            <span className="brand-mark">Г</span>
            <span className="brand-name">Гардероб</span>
          </a>
          <nav className="nav" aria-label="Разделы">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`nav-btn nav-${n.id} ${n.more ? 'nav-in-more' : ''} ${n.iconOnly ? 'nav-icon-only' : ''} ${route === n.id ? 'is-on' : ''}`}
                onClick={() => go(n.id)}
                title={n.label}
                aria-current={route === n.id ? 'page' : undefined}
              >
                <NavIcon>{n.icon}</NavIcon>
                <span className="nav-label">{n.label}</span>
                {n.id === 'builder' && draft.layers.length > 0 && <span className="nav-dot" />}
              </button>
            ))}
            <button className={`nav-btn nav-more ${moreActive || moreOpen ? 'is-on' : ''}`} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} data-testid="nav-more">
              <NavIcon><><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></></NavIcon>
              <span className="nav-label">Ещё</span>
            </button>
          </nav>
          <AccountBadge />
        </header>

        <main className="main">
          {route === 'wardrobe' && <WardrobeScreen />}
          {route === 'builder' && <BuilderScreen />}
          {route === 'suggest' && <SuggestScreen />}
          {route === 'outfits' && <OutfitsScreen />}
          {route === 'settings' && <SettingsScreen />}
          {route === 'diary' && <DiaryScreen />}
          {route === 'perfumes' && <PerfumesScreen />}
        </main>

        {moreOpen && (
          <div className="more-backdrop" onClick={() => setMoreOpen(false)}>
            <div className="more-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
              {NAV.filter((n) => n.more).map((n) => (
                <button key={n.id} role="menuitem" className={`more-item ${route === n.id ? 'is-on' : ''}`} onClick={() => go(n.id)}>
                  <NavIcon>{n.icon}</NavIcon>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          data-testid="file-input"
          accept="image/png,image/webp,image/jpeg"
          onChange={(e) => { startUpload(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />

        {dragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-inner">
              <b>Отпустите, чтобы добавить вещи</b>
              <span>PNG или WebP без фона</span>
            </div>
          </div>
        )}
        {diaryInit && <DiaryEntryDialog init={diaryInit} onClose={() => setDiaryInit(null)} onOpenPerfumes={() => go('perfumes')} />}
        {uploadFiles && <UploadDialog files={uploadFiles} onClose={() => setUploadFiles(null)} />}
        {detailItem && (
          <ItemDetail
            key={detailItem.id}
            item={detailItem}
            onClose={() => setOpenItemId(null)}
            onWear={(it) => {
              if (!draft.layers.some((l) => l.itemId === it.id)) wearItem(it);
              navigate('builder');
            }}
          />
        )}
      </div>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <UIProvider>
      <StoreProvider>
        <CloudProvider>
          <Shell />
        </CloudProvider>
      </StoreProvider>
    </UIProvider>
  );
}
