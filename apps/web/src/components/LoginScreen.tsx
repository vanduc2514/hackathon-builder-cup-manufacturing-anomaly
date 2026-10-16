// LoginScreen: shift-leader sign-in card; the role is fixed, so only the password is asked.
import React, { useEffect, useRef, useState } from 'react';
import type { AuthRole, DemoAccount } from '../types';
import { ROLE_ICON, ROLE_LABEL, fetchDemoAccounts, login, takeLoginPrefill } from '../lib/auth';

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
  const hasPrefill = useRef<boolean>(false);
  const [password, setPassword] = useState<string>(() => {
    const initial = takeLoginPrefill();
    if (initial) {
      hasPrefill.current = true;
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    fetchDemoAccounts().then((list) => {
      if (alive) setAccount(list.find((a) => a.role === LOGIN_ROLE) ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (hasPrefill.current && account) {
      submitButtonRef.current?.focus();
    }
  }, [account]);

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
            {/* Hidden username lets the browser save and fill the password for this account. */}
            <input type="text" name="username" autoComplete="username" value={account?.username ?? ''} readOnly hidden />
            <label className="col" style={{ gap: 6 }} htmlFor="login-password">
              <span style={LABEL_STYLE}>Password</span>
              <span style={{ position: 'relative', display: 'block' }}>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus={!hasPrefill.current}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...INPUT_STYLE, paddingRight: 48 }}
                />
                <button
                  id="login-toggle-password"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 44,
                    height: 44,
                    display: 'grid',
                    placeItems: 'center',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </span>
            </label>
            <button
              ref={submitButtonRef}
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
