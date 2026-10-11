import React, { useState } from 'react';
import type { IncidentState } from '../types';
import type { DashboardTab } from '../components/Sidebar';
import type { ToastTone } from '../App';
import ProductsView from '../components/views/ProductsView';
import IncidentCommandView from '../components/views/IncidentCommandView';
import KaizenImpactView from '../components/views/KaizenImpactView';
import TechWalkthroughsView from '../components/views/TechWalkthroughsView';
import SopLibraryView from '../components/views/SopLibraryView';

interface DashboardProps {
  incident: IncidentState | null;
  currentTab: DashboardTab;
  openIncident: { incident: IncidentState; product: string } | null;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenIncident: (product: string) => void;
  onOpenSimulation: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

export default function Dashboard({
  incident,
  currentTab,
  openIncident,
  onSelectTab,
  onOpenIncident,
  onOpenSimulation,
  onNotify,
}: DashboardProps): React.ReactElement {
  const [featuredWalkthrough, setFeaturedWalkthrough] = useState<string>('MW-08');
  const goHome = () => onSelectTab('products');
  const openWalkthrough = (id: string) => {
    setFeaturedWalkthrough(id);
    onSelectTab('walkthroughs');
  };
  return (
    <div style={{ width: '100%', minHeight: '100%' }}>
      {currentTab === 'products' && (
        <ProductsView
          incident={incident}
          onOpenIncident={onOpenIncident}
          onNavigateToSops={() => onSelectTab('sops')}
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
      {currentTab === 'impact' && <KaizenImpactView incident={incident} />}
      {currentTab === 'walkthroughs' && (
        <TechWalkthroughsView
          featuredId={featuredWalkthrough}
          onFeature={setFeaturedWalkthrough}
          onOpenSop={() => onSelectTab('sops')}
          onNotify={onNotify}
        />
      )}
      {currentTab === 'sops' && <SopLibraryView onOpenWalkthrough={openWalkthrough} onNotify={onNotify} />}
    </div>
  );
}
