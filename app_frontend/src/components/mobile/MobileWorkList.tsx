import React from 'react';
import type { WorkOrder, WorkStage } from '../../types/mobile';
import MobileHeader from './MobileHeader';
import WorkOrderCard from './WorkOrderCard';

interface MobileWorkListProps {
  orders: WorkOrder[];
  tab: WorkStage;
  initials: string;
  onTabChange: (tab: WorkStage) => void;
  onOpen: (order: WorkOrder) => void;
}

const TABS: { id: WorkStage; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'processing', label: 'Processing' },
  { id: 'completed', label: 'Completed' },
];

const TAB_HINT: Record<WorkStage, string> = {
  active: 'Jobs waiting on you right now.',
  processing: 'Submitted — being verified by your lead.',
  completed: 'Signed off and closed.',
};

/** Work List tab: Active / Processing / Completed segmented list. */
export default function MobileWorkList({
  orders,
  tab,
  initials,
  onTabChange,
  onOpen,
}: MobileWorkListProps): React.ReactElement {
  const count = (s: WorkStage) => orders.filter((o) => o.stage === s).length;
  const index = TABS.findIndex((t) => t.id === tab);
  const visible = orders.filter((o) => o.stage === tab);
  const evidence = visible.filter((o) => o.kind === 'evidence');
  const fixes = visible.filter((o) => o.kind === 'fix');

  return (
    <>
      <MobileHeader
        title="Work List"
        subtitle={`${count('active')} jobs need you · Bay 4`}
        initials={initials}
      />
      <div className="m-screen">
        <div className="m-seg" role="tablist">
          <div className="m-seg-thumb" style={{ transform: `translateX(${index * 100}%)` }} />
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`m-seg-${t.id}`}
              role="tab"
              aria-selected={t.id === tab}
              className={t.id === tab ? 'on' : ''}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              <span className="m-count">{count(t.id)}</span>
            </button>
          ))}
        </div>

        <p className="m-sub" style={{ margin: '-4px 4px 0' }}>{TAB_HINT[tab]}</p>

        <div key={tab} className="m-col" style={{ gap: 14, animation: 'm-enter .4s var(--ease) both' }}>
          {visible.length === 0 && (
            <div className="m-glass m-empty">
              <span className="material-symbols-outlined">task_alt</span>
              Nothing here. Nice work.
            </div>
          )}

          {tab === 'active' ? (
            <>
              {evidence.length > 0 && (
                <>
                  <div className="m-label">Collect evidence</div>
                  {evidence.map((o) => (
                    <WorkOrderCard key={o.id} order={o} onOpen={() => onOpen(o)} />
                  ))}
                </>
              )}
              {fixes.length > 0 && (
                <>
                  <div className="m-label">Repairs</div>
                  {fixes.map((o) => (
                    <WorkOrderCard key={o.id} order={o} onOpen={() => onOpen(o)} />
                  ))}
                </>
              )}
            </>
          ) : (
            visible.map((o) => <WorkOrderCard key={o.id} order={o} onOpen={() => onOpen(o)} />)
          )}
        </div>
      </div>
    </>
  );
}
