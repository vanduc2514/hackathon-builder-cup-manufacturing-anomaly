// Dashboard: routes the active sidebar tab to its view.
import React, { useEffect, useState } from 'react';
import type { IncidentState } from '../types';
import type { DashboardTab } from '../components/Sidebar';
import type { ToastTone } from '../App';
import type { EsgLedgerEntry } from '../lib/fleet';
import LineOverviewView from '../components/views/LineOverviewView';
import IncidentCommandView from '../components/views/IncidentCommandView';
import KaizenImpactView from '../components/views/KaizenImpactView';
import TechWalkthroughsView from '../components/views/TechWalkthroughsView';
import SopLibraryView from '../components/views/SopLibraryView';

interface DashboardProps {
  incident: IncidentState | null;
  currentTab: DashboardTab;
  openIncident: { incident: IncidentState; product: string } | null;
  openedAt: number | null;
  esgLedger: EsgLedgerEntry[];
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
  onRefreshIncident,
  onSelectTab,
  onOpenIncident,
  onOpenSimulation,
  onNotify,
}: DashboardProps): React.ReactElement {
  // Cross-links (SOP → video, video → SOP) land on the target page with that item's drawer already open.
  const [requestedWalkthrough, setRequestedWalkthrough] = useState<string | null>(null);
  const [requestedDocumentId, setRequestedDocumentId] = useState<string | null>(null);
  useEffect(() => {
    if (currentTab !== ('walkthroughs' as const)) setRequestedWalkthrough(null);
    if (currentTab !== 'sops') setRequestedDocumentId(null);
  }, [currentTab]);

  const goHome = () => onSelectTab('overview');
  const openWalkthrough = (id: string) => {
    setRequestedWalkthrough(id);
    onSelectTab('walkthroughs' as DashboardTab);
  };
  const openDocument = (documentId: string) => {
    setRequestedDocumentId(documentId);
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
          onNotify={onNotify}
        />
      )}
      {currentTab === 'incident-detail' && openIncident && (
        <IncidentCommandView
          key={openIncident.incident.incident_id}
          incident={openIncident.incident}
          product={openIncident.product}
          onNavigateHome={goHome}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'impact' && (
        <KaizenImpactView
          esgLedger={esgLedger}
          onOpenDocument={openDocument}
          onOpenWalkthrough={openWalkthrough}
        />
      )}
      {currentTab === 'walkthroughs' && (
        <TechWalkthroughsView
          requestedId={requestedWalkthrough}
          onOpenDocument={openDocument}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'sops' && (
        <SopLibraryView
          requestedDocumentId={requestedDocumentId}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
