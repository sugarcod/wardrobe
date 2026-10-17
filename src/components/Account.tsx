import { STATUS_LABEL, useCloud } from '../cloud';
import { useApp } from '../nav';

export function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Avatar({ name, photoURL, size = 30 }: { name: string; photoURL: string; size?: number }) {
  return photoURL ? (
    <img className="avatar" src={photoURL} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar avatar-letter" style={{ width: size, height: size }}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

/** Компактный блок в шапке: кнопка входа или аватар со статусом синхронизации */
export function AccountBadge() {
  const { available, user, status, signIn } = useCloud();
  const { navigate } = useApp();
  if (!available || user === undefined) return null;
  if (!user) {
    return (
      <button className="btn btn-ghost btn-sm account-signin" onClick={signIn}>
        <GoogleIcon /> <span className="account-signin-text">Войти через Google</span>
      </button>
    );
  }
  return (
    <button className="account-badge" onClick={() => navigate('settings')} title={`${user.name} · ${STATUS_LABEL[status]}`}>
      <span className={`sync-dot sync-${status}`} aria-hidden="true" />
      <span className="account-status">{STATUS_LABEL[status]}</span>
      <Avatar name={user.name} photoURL={user.photoURL} />
    </button>
  );
}

/** Раздел в настройках */
export function AccountSection() {
  const { available, user, status, signIn, signOut } = useCloud();
  if (!available) return null;
  return (
    <section className="panel settings-block" data-testid="account-section">
      <h2 className="panel-title">Аккаунт и синхронизация</h2>
      {user === undefined ? (
        <p className="muted">Проверяем вход…</p>
      ) : user ? (
        <>
          <div className="account-row">
            <Avatar name={user.name} photoURL={user.photoURL} size={44} />
            <div className="account-info">
              <b>{user.name}</b>
              {user.email && <span className="muted small">{user.email}</span>}
            </div>
            <span className="sync-pill"><span className={`sync-dot sync-${status}`} /> {STATUS_LABEL[status]}</span>
          </div>
          <p className="muted small">Вещи, фото и образы синхронизируются между вашими устройствами, где выполнен вход в этот аккаунт. Без интернета всё работает и досинхронизируется позже.</p>
          <button className="btn btn-ghost" onClick={signOut}>Выйти</button>
        </>
      ) : (
        <>
          <p className="muted">Войдите, чтобы вещи и образы были на всех ваших устройствах. Без входа всё хранится только в этом браузере.</p>
          <button className="btn btn-primary" onClick={signIn}><GoogleIcon /> Войти через Google</button>
        </>
      )}
    </section>
  );
}
