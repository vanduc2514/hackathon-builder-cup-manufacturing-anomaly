// App shell: owns the SSE incident subscription, simulation status polling and the glass layout chrome.
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar, { type DashboardTab, type IncidentTab } from './components/Sidebar';
import TopHeader from './components/TopHeader';
import DemoController from './components/DemoController';
import Dashboard from './pages/Dashboard';
import { productIncidents } from './lib/incident';
import type { IncidentState, SimulationStatusResponse } from './types';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  text: string;
  tone: ToastTone;
}

/** Open incident sub-tab plus the board snapshot taken when it was opened (live data wins while ids match). */
interface OpenIncidentTab extends IncidentTab {
  snapshot: IncidentState;
}

export default function App(): React.ReactElement {
  const [currentTab, setCurrentTab] = useState<DashboardTab>('products');
  const [incident, setIncident] = useState<IncidentState | null>(null);
  const [incidentTabs, setIncidentTabs] = useState<OpenIncidentTab[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatusResponse | null>(null);
  const [simOpen, setSimOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((text: string, tone: ToastTone = 'success') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const refreshIncident = useCallback(() => {
    fetch('/api/incidents/current')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: IncidentState | null) => {
        if (data) setIncident(data);
      })
      .catch((err) => console.warn('Incident fetch failed:', err));
  }, []);

  useEffect(() => {
    refreshIncident();
  }, [refreshIncident]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackAttempted = false;

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        setIncident(JSON.parse(event.data) as IncidentState);
      } catch (err) {
        console.error('Failed to parse incident SSE event:', err);
      }
    };

    const initEventSource = (url: string): EventSource => {
      const es = new EventSource(url);
      es.addEventListener('incident_update', handleMessage);
      es.onerror = () => {
        if (!fallbackAttempted && url === '/api/incidents/stream') {
          fallbackAttempted = true;
          es.close();
          eventSource = initEventSource('/api/incidents/events');
        }
      };
      return es;
    };

    eventSource = initEventSource('/api/incidents/stream');
    return () => eventSource?.close();
  }, []);

  const refreshSimStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/simulation/status');
      if (res.ok) setSimStatus((await res.json()) as SimulationStatusResponse);
    } catch {
      setSimStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshSimStatus();
    const id = window.setInterval(refreshSimStatus, 3000);
    return () => window.clearInterval(id);
  }, [refreshSimStatus]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [currentTab, activeIncidentId]);

  const openIncidentTab = useCallback(
    (product: string) => {
      const snapshot = productIncidents(incident)[product];
      if (!snapshot) return;
      const id = snapshot.incident_id;
      setIncidentTabs((prev) =>
        prev.some((t) => t.id === id)
          ? prev.map((t) => (t.id === id ? { ...t, product, snapshot } : t))
          : [...prev, { id, product, snapshot }],
      );
      setActiveIncidentId(id);
      setCurrentTab('incident-detail');
    },
    [incident],
  );

  const selectIncident = useCallback((id: string) => {
    setActiveIncidentId(id);
    setCurrentTab('incident-detail');
  }, []);

  const closeIncident = (id: string) => {
    const remaining = incidentTabs.filter((t) => t.id !== id);
    setIncidentTabs(remaining);
    if (activeIncidentId !== id) return;
    const next = remaining[remaining.length - 1];
    setActiveIncidentId(next?.id ?? null);
    if (currentTab === 'incident-detail') setCurrentTab(next ? 'incident-detail' : 'products');
  };

  const activeTab = incidentTabs.find((t) => t.id === activeIncidentId);
  const openIncident = activeTab
    ? { incident: incident?.incident_id === activeTab.id ? incident : activeTab.snapshot, product: activeTab.product }
    : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', position: 'relative' }}>
      <div className="app-backdrop" aria-hidden="true" />

      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        incidentTabs={incidentTabs}
        activeIncidentId={activeIncidentId}
        onSelectIncident={selectIncident}
        onCloseIncident={closeIncident}
      />

      <TopHeader onJump={setCurrentTab} />

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          marginLeft: 'calc(var(--sidebar-w) + 12px)',
          paddingTop: 'calc(var(--header-h) + 28px)',
          paddingRight: 16,
          paddingBottom: 40,
          paddingLeft: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Dashboard
          incident={incident}
          currentTab={currentTab}
          openIncident={openIncident}
          onSelectTab={setCurrentTab}
          onOpenIncident={openIncidentTab}
          onOpenSimulation={() => setSimOpen(true)}
          onNotify={notify}
        />
      </main>

      <DemoController
        open={simOpen}
        onClose={() => setSimOpen(false)}
        incident={incident}
        simStatus={simStatus}
        onStatusChange={() => {
          refreshSimStatus();
          refreshIncident();
        }}
        onNotify={notify}
      />

      {toast && (
        <div
          role="status"
          className={toast.tone === 'error' ? 'toast glass tone-red' : 'toast glass-dark'}
          style={{ color: toast.tone === 'error' ? '#9f1d22' : '#fff' }}
        >
          <span
            className="material-symbols-outlined icon-fill"
            style={{
              fontSize: 20,
              color: toast.tone === 'error' ? 'var(--red)' : toast.tone === 'info' ? '#a5b4fc' : '#4ade80',
            }}
          >
            {toast.tone === 'error' ? 'error' : toast.tone === 'info' ? 'info' : 'check_circle'}
          </span>
          <span style={{ flex: 1 }}>{toast.text}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            style={{ border: 'none', background: 'transparent', color: 'inherit', opacity: 0.6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
