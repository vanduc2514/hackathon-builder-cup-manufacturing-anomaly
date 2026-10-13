// LoginScreen: shift-leader sign-in card; the role is fixed, so only the password is asked.
import React, { useEffect, useState } from 'react';
import type { AuthRole, DemoAccount } from '../types';
import { ROLE_ICON, ROLE_LABEL, fetchDemoAccounts, login } from '../lib/auth';

const LOGIN_ROLE: AuthRole = 'shift_leader';

const LABEL_STYLE: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' };

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 0.8rem',
  borderRadius: 12,
  border: '1px solid var(--hair-strong)',
  background: 'rgba(255,255,255,0.8)',
  fontSize: '0.85rem',
  outline: 'none',
};

const AVATAR_STYLE: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 999,
  background: 'linear-gradient(160deg, #1f2937, #0b1220)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  margin: '0 auto',
};

export default function LoginScreen(): React.ReactElement {
  // undefined while loading, null when the server offers no shift-leader account.
  const [account, setAccount] = useState<DemoAccount | null | undefined>(undefined);
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    fetchDemoAccounts().then((list) => {
      if (alive) setAccount(list.find((a) => a.role === LOGIN_ROLE) ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!account) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(account.username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

  const message = account === null ? 'Sign-in is not available' : error;

  return (
    <>
      <div className="app-backdrop" aria-hidden="true" />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          className="glass card-pad"
          style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.35s var(--ease) both' }}
        >
          <div className="eyebrow">Kaizen Agent</div>
          <div className="col" style={{ gap: 6, marginTop: '1rem', textAlign: 'center' }}>
            <div style={AVATAR_STYLE}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                {ROLE_ICON[LOGIN_ROLE]}
              </span>
            </div>
            <h1 className="page-title">{ROLE_LABEL[LOGIN_ROLE]}</h1>
            <div className="card-sub">Plant Ops dashboard</div>
          </div>

          <form className="col" style={{ gap: '0.9rem', marginTop: '1.25rem' }} onSubmit={submit}>
            <label className="col" style={{ gap: 6 }} htmlFor="login-password">
              <span style={LABEL_STYLE}>Password</span>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>
            <button
              id="login-submit"
              type="submit"
              className="btn btn-dark btn-block"
              style={{ height: 48 }}
              disabled={submitting || !account || !password}
            >
              <span className="material-symbols-outlined">login</span>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            {message && (
              <div role="alert" style={{ color: '#c9343a', fontSize: '0.8rem' }}>
                {message}
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
