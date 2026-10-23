import { createContext, useContext, useEffect, useState } from 'react';
import type { DiaryEntry, Item, Layer } from './types';

/** С чего начать запись в дневник */
export interface DiaryInit {
  entry?: DiaryEntry;
  date?: string;
  layers?: Layer[];
  outfitId?: string;
  perfumeIds?: string[];
  /** откуда пришли — для подписи в окне */
  source?: 'builder' | 'outfit' | 'calendar';
}

export type Route = 'wardrobe' | 'builder' | 'diary' | 'perfumes' | 'suggest' | 'outfits' | 'stats' | 'settings';
const ROUTES: Route[] = ['wardrobe', 'builder', 'diary', 'perfumes', 'suggest', 'outfits', 'stats', 'settings'];

function parse(): Route | null {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : null;
}

export function useHashRoute(fallback: Route): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parse() ?? fallback);
  useEffect(() => {
    const on = () => setRoute(parse() ?? fallback);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [fallback]);
  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
    window.scrollTo({ top: 0 });
  };
  return [route, navigate];
}

export interface AppActions {
  navigate: (r: Route) => void;
  startUpload: (files: File[]) => void;
  pickFiles: () => void;
  openItem: (item: Item) => void;
  recordDiary: (init: DiaryInit) => void;
}

export const AppCtx = createContext<AppActions | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
}
