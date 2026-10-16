// Dashboard: routes the active sidebar tab to its view.
import React, { useEffect, useState } from 'react';
import type { IncidentState } from '../types';
import type { DashboardTab } from '../components/Sidebar';
import type { ToastTone } from '../App';
import type { EsgLedgerEntry, EsgTotals } from '../lib/fleet';
import LineOverviewView from '../components/views/LineOverviewView';
import IncidentCommandView from '../components/views/IncidentCommandView';
import IncidentsEmptyView from '../components/views/IncidentsEmptyView';
import KaizenImpactView from '../components/views/KaizenImpactView';
import TechWalkthroughsView from '../components/views/TechWalkthroughsView';
import SopLibraryView from '../components/views/SopLibraryView';
import SystemTopologyView from '../components/views/SystemTopologyView';

interface DashboardProps {
  incident: IncidentState | null;
  currentTab: DashboardTab;
  openIncident: { incident: IncidentState; product: string } | null;
  openedAt: number | null;
  esgLedger: EsgLedgerEntry[];
  esgTotals: EsgTotals;
  downtimeMinutes: number;
  factoryType: string;
  onRefreshIncident: () => void;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenIncident: (incidentId: string) => void;
  onOpenSimulation: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

export default function Dashboard({
  incident,
  currentTab,
  openIncident,
  openedAt,
  esgLedger,
  esgTotals,
  downtimeMinutes,
  factoryType,
  onRefreshIncident,
  onSelectTab,
  onOpenIncident,
  onOpenSimulation,
  onNotify,
}: DashboardProps): React.ReactElement {
  // Cross-links (SOP → video, video → SOP) land on the target page with that item's drawer already open.
  const [requestedWalkthrough, setRequestedWalkthrough] = useState<string | null>(null);
  const [requestedSop, setRequestedSop] = useState<number | null>(null);
  useEffect(() => {
    if (currentTab !== 'walkthroughs') setRequestedWalkthrough(null);
    if (currentTab !== 'sops') setRequestedSop(null);
  }, [currentTab]);

  const goHome = () => onSelectTab('overview');
  const openWalkthrough = (id: string) => {
    setRequestedWalkthrough(id);
    onSelectTab('walkthroughs');
  };
  const openSop = (code: number) => {
    setRequestedSop(code);
    onSelectTab('sops');
  };
  return (
    <div style={{ width: '100%', minHeight: '100%' }}>
      {currentTab === 'overview' && (
        <LineOverviewView
          incident={incident}
          openedAt={openedAt}
          esgLedger={esgLedger}
          onRefreshIncident={onRefreshIncident}
          onOpenIncident={onOpenIncident}
          onOpenEsgHub={() => onSelectTab('impact')}
          onOpenSimulation={onOpenSimulation}
          onOpenTopology={() => onSelectTab('topology')}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'topology' && (
        <SystemTopologyView
          incident={incident}
          onOpenIncident={onOpenIncident}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'incident-detail' && openIncident && (
        <IncidentCommandView
          key={openIncident.incident.incident_id}
          incident={openIncident.incident}
          product={openIncident.product}
          onNavigateHome={goHome}
          onOpenTopology={() => onSelectTab('topology')}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'incident-detail' && !openIncident && (
        <IncidentsEmptyView
          onOpenSimulation={onOpenSimulation}
          onNavigateHome={goHome}
        />
      )}
      {currentTab === 'impact' && (
        <KaizenImpactView
          esgLedger={esgLedger}
          esgTotals={esgTotals}
          downtimeMinutes={downtimeMinutes}
          factoryType={factoryType}
          onOpenSop={openSop}
          onOpenWalkthrough={openWalkthrough}
        />
      )}
      {currentTab === 'walkthroughs' && <TechWalkthroughsView requestedId={requestedWalkthrough} onOpenSop={openSop} onNotify={onNotify} />}
      {currentTab === 'sops' && <SopLibraryView requestedCode={requestedSop} onOpenWalkthrough={openWalkthrough} onNotify={onNotify} />}
    </div>
  );
}
