import React from 'react';

interface MobileNavBarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  trailing?: React.ReactNode;
}

/** Detail-page navigation bar: glass back button, centred title, optional trailing slot. */
export default function MobileNavBar({
  title,
  subtitle,
  onBack,
  trailing,
}: MobileNavBarProps): React.ReactElement {
  return (
    <header className="m-navbar">
      <button className="m-iconbtn" onClick={onBack} aria-label="Back" id="m-back-btn">
        <span className="material-symbols-outlined">arrow_back_ios_new</span>
      </button>
      <div className="center">
        <div className="t">{title}</div>
        {subtitle && <div className="s">{subtitle}</div>}
      </div>
      <div className="right">{trailing}</div>
    </header>
  );
}
