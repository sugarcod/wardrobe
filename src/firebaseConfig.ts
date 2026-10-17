/**
 * Конфигурация Firebase (веб-приложение).
 *
 * Как подключить облако: Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config.
 * Либо вставьте объект прямо в MANUAL_CONFIG ниже (веб-конфиг Firebase не секретный, его можно коммитить),
 * либо задайте переменные окружения VITE_FIREBASE_* (см. .env.example) — они имеют приоритет.
 *
 * Если конфиг не заполнен, приложение работает только локально, а кнопка «Войти через Google» скрыта.
 */
export const MANUAL_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
  storageBucket: '',
  messagingSenderId: '',
};

const env = import.meta.env;
const pick = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

export const firebaseConfig = {
  apiKey: pick(env.VITE_FIREBASE_API_KEY, MANUAL_CONFIG.apiKey),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, MANUAL_CONFIG.authDomain),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, MANUAL_CONFIG.projectId),
  appId: pick(env.VITE_FIREBASE_APP_ID, MANUAL_CONFIG.appId),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, MANUAL_CONFIG.storageBucket),
  messagingSenderId: pick(env.VITE_FIREBASE_MESSAGING_SENDER_ID, MANUAL_CONFIG.messagingSenderId),
};

export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

/** Только для разработки/тестов: адрес локальных эмуляторов Firebase, например 127.0.0.1 */
export const emulatorHost: string = pick(env.VITE_FIREBASE_EMULATOR_HOST, '');
