import React, { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL, fetchDemoAccounts, login } from '../../api/auth';
import type { DemoAccount } from '../../types';
import './mobile.css';

/** Sign-in screen shown inside the phone chassis; demo chips prefill the account. */
export default function MobileLogin(): React.ReactElement {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDemoAccounts().then((list) => {
      if (!cancelled) setAccounts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = (account: DemoAccount) => {
    setUsername(account.username);
    setPassword(account.password ?? '');
    setError(null);
    // Production hides passwords: the user types it.
    if (account.password === null) passwordRef.current?.focus();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // On success AuthGate re-renders into the app; this component unmounts.
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="m-app">
      <div className="m-bg" aria-hidden>
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <div className="m-screen" style={{ height: '100%', justifyContent: 'center' }}>
        <section className="m-glass m-card m-col" style={{ gap: 14 }}>
          <div className="m-col" style={{ gap: 4 }}>
            <div className="m-h2" style={{ fontSize: 30 }}>
              Sign in
            </div>
            <div className="m-sub">Technician app</div>
          </div>

          {accounts.length > 0 && (
            <>
              <div className="m-label">Demo accounts</div>
              <div className="m-row" style={{ flexWrap: 'wrap' }}>
                {accounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className={`m-chip plain ${username === account.username ? 'indigo' : ''}`}
                    style={{ height: 44, padding: '0 14px', border: 0, cursor: 'pointer' }}
                    onClick={() => pick(account)}
                  >
                    <span className="material-symbols-outlined">
                      {account.role === 'technician' ? 'engineering' : 'supervisor_account'}
                    </span>
                    {ROLE_LABEL[account.role]} · {account.display_name}
                  </button>
                ))}
              </div>
            </>
          )}

          <form className="m-col" style={{ gap: 14 }} onSubmit={submit}>
            <section className="m-glass m-list" style={{ padding: 0 }}>
              <div className="m-field">
                <label htmlFor="m-login-username">Username</label>
                <input
                  id="m-login-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="m-field">
                <label htmlFor="m-login-password">Password</label>
                <input
                  ref={passwordRef}
                  id="m-login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </section>

            <button
              type="submit"
              className="m-btn"
              id="m-login-submit"
              disabled={submitting || !username.trim() || !password}
            >
              <span className="material-symbols-outlined">login</span>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {error && (
            <div className="m-sub" role="alert" style={{ color: '#d70015' }}>
              {error}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
