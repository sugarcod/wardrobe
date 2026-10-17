import { useEffect, useRef, useState } from 'react';
import { UIProvider } from './ui';
import { StoreProvider, useStore } from './store';
import { AppCtx, useHashRoute, type Route } from './nav';
import { UploadDialog } from './components/UploadDialog';
import { ItemDetail } from './components/ItemDetail';
import { WardrobeScreen } from './screens/WardrobeScreen';
import { BuilderScreen } from './screens/BuilderScreen';
import { SuggestScreen } from './screens/SuggestScreen';
import { OutfitsScreen } from './screens/OutfitsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { Item } from './types';

const NAV: { id: Route; label: string; icon: React.ReactNode }[] = [
  { id: 'wardrobe', label: 'Гардероб', icon: <path d="M12 6a2 2 0 1 1 2-2M12 6v1.5L3.5 14a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 7.5" /> },
  { id: 'builder', label: 'Образ', icon: <><circle cx="12" cy="4.5" r="2" /><path d="M8 9l1.5-2h5L16 9l-1 5h-6zM9.5 14l-.5 7M14.5 14l.5 7" /></> },
  { id: 'suggest', label: 'Что надеть?', icon: <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /> },
  { id: 'outfits', label: 'Образы', icon: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></> },
  { id: 'settings', label: 'Настройки', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></> },
];

function Shell() {
  const { items, wearItem, draft } = useStore();
  const [route, navigate] = useHashRoute(items.length ? 'builder' : 'wardrobe');
  const [uploadFiles, setUploadFiles] = useState<File[] | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
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
  const actions = { navigate, startUpload, pickFiles: () => fileRef.current?.click(), openItem };

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
              <button key={n.id} className={`nav-btn ${route === n.id ? 'is-on' : ''}`} onClick={() => navigate(n.id)}>
                <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{n.icon}</svg>
                <span>{n.label}</span>
                {n.id === 'builder' && draft.layers.length > 0 && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
        </header>

        <main className="main">
          {route === 'wardrobe' && <WardrobeScreen />}
          {route === 'builder' && <BuilderScreen />}
          {route === 'suggest' && <SuggestScreen />}
          {route === 'outfits' && <OutfitsScreen />}
          {route === 'settings' && <SettingsScreen />}
        </main>

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
        <Shell />
      </StoreProvider>
    </UIProvider>
  );
}
