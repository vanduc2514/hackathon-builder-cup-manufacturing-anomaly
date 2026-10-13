// LoginScreen: username/password sign-in card with quick-pick chips for the demo accounts.
import React, { useEffect, useRef, useState } from 'react';
import type { DemoAccount } from '../types';
import { ROLE_LABEL, fetchDemoAccounts, login } from '../lib/auth';

const ROLE_ICON: Record<DemoAccount['role'], string> = {
  technician: 'engineering',
  shift_leader: 'supervisor_account',
};

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

export default function LoginScreen(): React.ReactElement {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDemoAccounts().then((list) => {
      if (alive) setAccounts(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pick = (account: DemoAccount) => {
    setUsername(account.username);
    setPassword(account.password ?? '');
    setError(null);
    if (account.password === null) passwordRef.current?.focus();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

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
          <h1 className="page-title">Sign in</h1>
          <div className="card-sub">Plant Ops dashboard</div>

          {accounts.length > 0 && (
            <div className="col" style={{ gap: 8, marginTop: '1.25rem' }}>
              <div className="eyebrow">Demo accounts</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {accounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className={`chip${username === account.username ? ' chip-accent' : ''}`}
                    style={{ height: 44, cursor: 'pointer' }}
                    onClick={() => pick(account)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {ROLE_ICON[account.role]}
                    </span>
                    {ROLE_LABEL[account.role]} · {account.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="col" style={{ gap: '0.9rem', marginTop: '1.25rem' }} onSubmit={submit}>
            <label className="col" style={{ gap: 6 }} htmlFor="login-username">
              <span style={LABEL_STYLE}>Username</span>
              <input
                id="login-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={INPUT_STYLE}
              />
            </label>
            <label className="col" style={{ gap: 6 }} htmlFor="login-password">
              <span style={LABEL_STYLE}>Password</span>
              <input
                ref={passwordRef}
                id="login-password"
                type="password"
                autoComplete="current-password"
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
              disabled={submitting || !username.trim() || !password}
            >
              <span className="material-symbols-outlined">login</span>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            {error && (
              <div role="alert" style={{ color: '#c9343a', fontSize: '0.8rem' }}>
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
