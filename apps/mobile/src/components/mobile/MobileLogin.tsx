import React, { useEffect, useRef, useState } from 'react';
import { ROLE_ICON, ROLE_LABEL, fetchDemoAccounts, login, takeLoginPrefill } from '../../api/auth';
import type { AuthRole, DemoAccount } from '../../types';
import './mobile.css';

const LOGIN_ROLE: AuthRole = 'technician';

/** Technician sign-in inside the phone chassis; the role is fixed, so only the password is asked. */
export default function MobileLogin(): React.ReactElement {
  // undefined while loading, null when the server offers no technician account.
  const [account, setAccount] = useState<DemoAccount | null | undefined>(undefined);
  const hasPrefill = useRef<boolean>(false);
  const autoSubmitted = useRef<boolean>(false);
  const [password, setPassword] = useState<string>(() => {
    const initial = takeLoginPrefill();
    if (initial) {
      hasPrefill.current = true;
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDemoAccounts().then((list) => {
      if (!cancelled) setAccount(list.find((a) => a.role === LOGIN_ROLE) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasPrefill.current && account && password && !autoSubmitted.current) {
      autoSubmitted.current = true;
      // Auto-submit once the prefill password is in place and the account resolves.
      setSubmitting(true);
      void login(account.username, password).catch((err) => {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        setSubmitting(false);
      });
    }
  }, [account, password]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!account) return;
    setSubmitting(true);
    setError(null);
    try {
      // On success AuthGate re-renders into the app; this component unmounts.
      await login(account.username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

  const message = account === null ? 'Sign-in is not available' : error;

  return (
    <div className="m-app">
      <div className="m-bg" aria-hidden>
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <div className="m-screen" style={{ height: '100%', justifyContent: 'center', paddingBottom: 0 }}>
        <section className="m-glass m-card m-col" style={{ gap: 14 }}>
          <div className="m-col" style={{ gap: 4, alignItems: 'center', textAlign: 'center' }}>
            <div className="m-avatar lg" style={{ margin: '0 auto' }}>
              <span className="material-symbols-outlined">{ROLE_ICON[LOGIN_ROLE]}</span>
            </div>
            <div className="m-h2" style={{ fontSize: 30 }}>
              {ROLE_LABEL[LOGIN_ROLE]}
            </div>
            <div className="m-sub">Technician app</div>
          </div>

          <form className="m-col" style={{ gap: 14 }} onSubmit={submit}>
            {/* Hidden username lets the browser save and fill the password for this account. */}
            <input type="text" name="username" autoComplete="username" value={account?.username ?? ''} readOnly hidden />
            <section className="m-glass m-list" style={{ padding: 0 }}>
              <div className="m-field">
                <label htmlFor="m-login-password">Password</label>
                <input
                  id="m-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus={!hasPrefill.current}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  id="m-login-toggle-password"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    width: 44,
                    height: 44,
                    margin: '-7px -10px -7px -4px',
                    display: 'grid',
                    placeItems: 'center',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--ink-3)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </section>

            <button
              type="submit"
              className="m-btn"
              id="m-login-submit"
              disabled={submitting || !account || !password}
            >
              <span className="material-symbols-outlined">login</span>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {message && (
            <div className="m-sub" role="alert" style={{ color: '#d70015' }}>
              {message}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
