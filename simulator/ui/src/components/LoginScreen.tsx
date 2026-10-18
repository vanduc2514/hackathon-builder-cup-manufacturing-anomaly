// LoginScreen: Plant operator sign-in card for the Factory Floor UI.
import React, { useEffect, useRef, useState } from 'react';
import type { AuthRole, DemoAccount } from '../types';
import { ROLE_ICON, ROLE_LABEL, fetchDemoAccounts, login, takeLoginPrefill } from '../lib/auth';

const DEFAULT_ROLE: AuthRole = 'technician';

const LABEL_STYLE: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' };

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 0.8rem',
  borderRadius: 12,
  border: '1px solid var(--hair)',
  background: 'rgba(255, 255, 255, 0.85)',
  color: 'var(--ink)',
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
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null);
  const [selectedRole, setSelectedRole] = useState<AuthRole>(DEFAULT_ROLE);
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
      if (alive) {
        setAccounts(list);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const activeAccount = accounts?.find((a) => a.role === selectedRole) ?? accounts?.[0] ?? {
    username: selectedRole === 'technician' ? 'technician' : 'shiftleader',
    display_name: selectedRole === 'technician' ? 'Plant Operator' : 'Shift Leader',
    role: selectedRole,
  };

  useEffect(() => {
    if (hasPrefill.current && activeAccount) {
      submitButtonRef.current?.focus();
    }
  }, [activeAccount]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeAccount) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(activeAccount.username, password);
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
          className="glass-card"
          style={{ width: '100%', maxWidth: 420, padding: '2rem 1.8rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)' }}>
            kAIzen Platform
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
            <div style={AVATAR_STYLE}>
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                {ROLE_ICON[selectedRole] || 'precision_manufacturing'}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.5rem', fontWeight: 700 }}>
              {ROLE_LABEL[selectedRole] || 'Plant Operator'}
            </h1>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Factory Floor & Machine Simulator
            </div>
          </div>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }} onSubmit={submit}>
            {/* Hidden username lets the browser save and fill the password for this account */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={activeAccount.username}
              readOnly
              hidden
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }} htmlFor="login-password">
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
              className="action-btn"
              style={{
                height: 46,
                background: 'linear-gradient(135deg, #1f2937, #0b1220)',
                color: '#fff',
                width: '100%',
                cursor: submitting || !password ? 'not-allowed' : 'pointer',
                opacity: submitting || !password ? 0.6 : 1,
              }}
              disabled={submitting || !password}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>login</span>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            {error && (
              <div role="alert" style={{ color: 'var(--red)', fontSize: '0.8rem', textAlign: 'center' }}>
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
