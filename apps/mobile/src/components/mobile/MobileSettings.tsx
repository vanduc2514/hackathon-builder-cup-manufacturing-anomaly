import React from 'react';
import type { TechnicianProfile } from '../../types/mobile';
import MobileHeader from './MobileHeader';

interface MobileSettingsProps {
  profile: TechnicianProfile;
  onChange: (profile: TechnicianProfile) => void;
  onSignOut: () => void;
}

type TextKey = 'phone' | 'email' | 'leadName';
type ToggleKey = 'voiceGuidance' | 'pushAlerts' | 'haptics';

/** Personal information and a few preferences. Kept deliberately small. */
export default function MobileSettings({
  profile,
  onChange,
  onSignOut,
}: MobileSettingsProps): React.ReactElement {
  const set = <K extends keyof TechnicianProfile>(key: K, value: TechnicianProfile[K]) =>
    onChange({ ...profile, [key]: value });

  const textFields: { key: TextKey; label: string; type: string }[] = [
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'leadName', label: 'Shift Leader', type: 'text' },
  ];

  const toggles: { key: ToggleKey; label: string; icon: string }[] = [
    { key: 'voiceGuidance', label: 'Voice guidance', icon: 'record_voice_over' },
    { key: 'pushAlerts', label: 'Push notifications', icon: 'notifications' },
    { key: 'haptics', label: 'Haptics', icon: 'vibration' },
  ];

  return (
    <>
      <MobileHeader title="Settings" />
      <div className="m-screen">
        <section className="m-glass m-card m-row" style={{ gap: 14 }}>
          <div className="m-avatar lg">
            <span className="material-symbols-outlined">engineering</span>
          </div>
          <div className="m-col" style={{ gap: 2, flex: 1 }}>
            <div className="m-h2">{profile.role}</div>
            <div className="m-row" style={{ gap: 6, marginTop: 4 }}>
              <span className="m-chip plain m-mono">{profile.employeeId}</span>
              <span className="m-chip indigo plain">{profile.bay}</span>
            </div>
          </div>
        </section>

        <div className="m-label">Personal information</div>
        <section className="m-glass m-list" style={{ padding: 0 }}>
          {textFields.map((f) => (
            <div key={f.key} className="m-field">
              <label htmlFor={`m-set-${f.key}`}>{f.label}</label>
              <input
                id={`m-set-${f.key}`}
                type={f.type}
                value={profile[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="m-field">
            <label>Shift</label>
            <input value={profile.shift} readOnly style={{ color: 'var(--ink-3)' }} />
          </div>
        </section>

        <div className="m-label">Preferences</div>
        <section className="m-glass m-list" style={{ padding: 0 }}>
          <div className="m-field">
            <label htmlFor="m-set-lang">Language</label>
            <select
              id="m-set-lang"
              value={profile.language}
              onChange={(e) => set('language', e.target.value as TechnicianProfile['language'])}
            >
              <option value="vi-VN">Tiếng Việt</option>
              <option value="en-US">English</option>
            </select>
            <span className="material-symbols-outlined m-li-chev" style={{ fontSize: 18 }}>unfold_more</span>
          </div>
          {toggles.map((t) => (
            <div key={t.key} className="m-field">
              <span className="m-li-icon" style={{ width: 28, height: 28, borderRadius: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 550 }}>{t.label}</span>
              <button
                className={`m-switch ${profile[t.key] ? 'on' : ''}`}
                onClick={() => set(t.key, !profile[t.key])}
                role="switch"
                aria-checked={profile[t.key]}
                aria-label={t.label}
                id={`m-set-${t.key}`}
              />
            </div>
          ))}
        </section>

        <button className="m-btn glass" style={{ color: '#d70015' }} id="m-sign-out" onClick={onSignOut}>
          <span className="material-symbols-outlined">logout</span>
          Sign out
        </button>
        <p className="m-sub" style={{ textAlign: 'center', margin: 0 }}>kAIgen · v1.0</p>
      </div>
    </>
  );
}
