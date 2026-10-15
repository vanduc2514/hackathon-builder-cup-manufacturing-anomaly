import React from 'react';
import type { MobileNotification } from '../../types/mobile';
import MobileHeader from './MobileHeader';

interface MobileNotificationsProps {
  items: MobileNotification[];
  onOpen: (n: MobileNotification) => void;
  onMarkAllRead: () => void;
}

/** Simple grouped notification list. */
export default function MobileNotifications({
  items,
  onOpen,
  onMarkAllRead,
}: MobileNotificationsProps): React.ReactElement {
  const unread = items.filter((n) => n.unread).length;
  const groups: MobileNotification['group'][] = ['Today', 'Earlier'];

  return (
    <>
      <MobileHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You’re all caught up'}
        trailing={
          unread > 0 ? (
            <button className="m-btn xs glass" onClick={onMarkAllRead} id="m-mark-read">
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="m-screen">
        {items.length === 0 ? (
          <div className="m-glass m-empty" style={{ margin: '24px 0' }}>
            <span className="material-symbols-outlined">notifications_none</span>
            No notifications. You’re all caught up.
          </div>
        ) : (
          groups.map((g) => {
            const list = items.filter((n) => n.group === g);
            if (list.length === 0) return null;
            return (
              <React.Fragment key={g}>
                <div className="m-label">{g}</div>
                <section className="m-glass m-list" style={{ padding: 0 }}>
                  {list.map((n) => (
                    <div key={n.id} className="m-notif" onClick={() => onOpen(n)} id={`m-notif-${n.id}`}>
                      <span className={`m-notif-icon ${n.tone}`}>
                        <span className="material-symbols-outlined ms-fill">{n.icon}</span>
                      </span>
                      <div className="m-li-body">
                        <div className="m-between">
                          <span className="m-li-title" style={{ fontSize: 13.5, fontWeight: n.unread ? 700 : 600 }}>
                            {n.title}
                          </span>
                          <span className="m-sub" style={{ fontSize: 11, flexShrink: 0 }}>{n.time}</span>
                        </div>
                        <div className="m-li-sub" style={{ lineHeight: 1.35 }}>{n.body}</div>
                      </div>
                      {n.unread ? <span className="m-unread" /> : <span style={{ width: 8 }} />}
                    </div>
                  ))}
                </section>
              </React.Fragment>
            );
          })
        )}
      </div>
    </>
  );
}
