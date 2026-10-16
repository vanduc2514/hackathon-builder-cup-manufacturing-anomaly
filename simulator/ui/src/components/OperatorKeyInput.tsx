import React from 'react';

interface Props {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  authError?: string | null;
}

export default function OperatorKeyInput({
  apiKey,
  onApiKeyChange,
  authError,
}: Props): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label
          htmlFor="operator-api-key"
          className="section-title text-xs"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
        >
          <span className="material-symbols-outlined accent-icon" style={{ fontSize: '16px' }}>
            key
          </span>
          Operator Key:
        </label>
        <input
          id="operator-api-key"
          type="password"
          className="mono"
          placeholder="X-API-Key (stored in session, required in prod)"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          style={{
            flex: '1 1 200px',
            padding: '5px 10px',
            fontSize: '12px',
            borderRadius: '6px',
            border: authError ? '1px solid var(--red)' : '1px solid var(--hair)',
            background: 'rgba(255, 255, 255, 0.85)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        {apiKey && (
          <button
            type="button"
            className="tab-btn"
            onClick={() => onApiKeyChange('')}
            style={{ cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>
      {authError && (
        <div
          className="banner-alert"
          style={{ margin: 0, padding: '6px 10px', fontSize: '11px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            error
          </span>
          <span>{authError}</span>
        </div>
      )}
    </div>
  );
}
