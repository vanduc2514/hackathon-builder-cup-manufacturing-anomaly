import React from 'react';

export type MobileTab = 'work-list' | 'ai-helper' | 'notifications' | 'settings';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  notificationCount: number;
  onDark?: boolean;
}

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'work-list', label: 'Work List', icon: 'assignment' },
  { id: 'ai-helper', label: 'AI Helper', icon: 'auto_awesome' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
];

/** Floating glass dock with a spring-animated black selection pill. */
export default function MobileNav({
  activeTab,
  onTabChange,
  notificationCount,
  onDark = false,
}: MobileNavProps): React.ReactElement {
  const index = TABS.findIndex((t) => t.id === activeTab);

  return (
    <nav className={`m-dock ${onDark ? 'on-dark' : ''}`} aria-label="Main navigation">
      <div className="m-dock-thumb" style={{ transform: `translateX(${index * 100}%)` }} />
      {TABS.map((tab) => {
        const on = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`m-tab-${tab.id}`}
            className={on ? 'on' : ''}
            onClick={() => onTabChange(tab.id)}
            aria-current={on ? 'page' : undefined}
          >
            <span className={`material-symbols-outlined ${on ? 'ms-fill' : ''}`}>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'notifications' && notificationCount > 0 && (
              <span className="m-badge">{notificationCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
