// App shell: owns the SSE incident subscription, backend health, ESG ledger, simulation polling and the glass chrome.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar, { type BackendLink, type DashboardTab, type IncidentTab } from './components/Sidebar';
import TopHeader from './components/TopHeader';
import DemoController from './components/DemoController';
import Dashboard from './pages/Dashboard';
import { ACTIVE_PRODUCT, productIncidents } from './lib/incident';
import { isIncidentOpen, type EsgLedgerEntry } from './lib/fleet';
import { buildSolution } from './lib/eightD';
import { streamUrl } from './lib/api';
import { authFetch, withToken } from './lib/auth';
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

const ESG_KEY = 'kaizen.esgLedger.v1';
const SOUND_KEY = 'kaizen.alertSound';

const CRUMB: Record<DashboardTab, string> = {
  overview: 'Line Overview',
  'incident-detail': 'Incidents',
  impact: 'Knowledge Base',
  sops: 'SOP Change Log',
  walkthroughs: 'Tech Walkthroughs',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (private mode); the value just won't persist
  }
}

function playAlertTone(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    // audio unavailable until the user interacts with the page
  }
}

export default function App(): React.ReactElement {
  const [currentTab, setCurrentTab] = useState<DashboardTab>('overview');
  const [incident, setIncident] = useState<IncidentState | null>(null);
  const [incidentTabs, setIncidentTabs] = useState<OpenIncidentTab[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatusResponse | null>(null);
  const [simOpen, setSimOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [link, setLink] = useState<BackendLink | null>(null);
  const [esgLedger, setEsgLedger] = useState<EsgLedgerEntry[]>(() =>
    readStorage<EsgLedgerEntry[]>(ESG_KEY, []).filter((e) => e.solution?.approved),
  );
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({});
  const [soundOn, setSoundOn] = useState<boolean>(() => readStorage<boolean>(SOUND_KEY, true));
  const alertedId = useRef<string | null>(null);

  const notify = useCallback((text: string, tone: ToastTone = 'success') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const refreshIncident = useCallback(() => {
    authFetch('/api/incidents/current')
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

    const initEventSource = (path: string): EventSource => {
      const es = new EventSource(withToken(streamUrl(path)));
      es.addEventListener('incident_update', handleMessage);
      es.onerror = () => {
        if (!fallbackAttempted && path === '/api/incidents/stream') {
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

  useEffect(() => {
    const ping = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        setLink({ ok: res.ok, latencyMs: Math.round(performance.now() - t0) });
      } catch {
        setLink({ ok: false, latencyMs: null });
      }
    };
    ping();
    const id = window.setInterval(ping, 10000);
    return () => window.clearInterval(id);
  }, []);

  // Record when each incident was first seen open (SLA clock) and sound the alert once per new incident.
  useEffect(() => {
    if (!isIncidentOpen(incident)) return;
    const id = incident.incident_id;
    const initialTime = incident.opened_at ? new Date(incident.opened_at).getTime() : Date.now();
    setOpenedAt((prev) => (prev[id] ? prev : { ...prev, [id]: initialTime }));
    if (alertedId.current !== id) {
      alertedId.current = id;
      if (soundOn) playAlertTone();
    }
  }, [incident, soundOn]);

  // Each signed-off incident is booked into the ESG ledger: backend impact (CO2 totals) plus its verified-solution snapshot.
  // Closed-but-unsigned 8Ds stay on the incident page until the shift leader approves them.
  useEffect(() => {
    if (!incident?.impact || !incident.approved) return;
    const solution = buildSolution(incident);
    const entry: EsgLedgerEntry = { incidentId: incident.incident_id, impact: incident.impact, solution };
    setEsgLedger((prev) => {
      const old = prev.find((e) => e.incidentId === entry.incidentId);
      // Keep the first-recorded time so the table order and dates don't jump on every SSE update.
      const keep = old?.solution ? { ...entry, solution: { ...solution, recordedAt: old.solution.recordedAt } } : entry;
      const next = old ? prev.map((e) => (e.incidentId === entry.incidentId ? keep : e)) : [...prev, entry];
      writeStorage(ESG_KEY, next);
      return next;
    });
  }, [incident]);

  const toggleSound = () => {
    setSoundOn((v) => {
      writeStorage(SOUND_KEY, !v);
      return !v;
    });
  };

  const refreshSimStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/simulation/status');
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
    (id: string) => {
      const entry = Object.entries(productIncidents(incident)).find(([, inc]) => inc.incident_id === id);
      const snapshot = incident?.incident_id === id ? incident : entry?.[1];
      if (!snapshot) return;
      const product = entry?.[0] ?? ACTIVE_PRODUCT;
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

  const openIncidents = () => {
    if (isIncidentOpen(incident)) {
      openIncidentTab(incident.incident_id);
      return;
    }
    const last = incidentTabs[incidentTabs.length - 1];
    if (last) {
      setActiveIncidentId(last.id);
      setCurrentTab('incident-detail');
      return;
    }
    notify('No open incidents on Cell Line 1', 'info');
  };

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
    if (currentTab === 'incident-detail') setCurrentTab(next ? 'incident-detail' : 'overview');
  };

  const openCount = isIncidentOpen(incident) ? 1 : 0;
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
        openIncidentCount={openCount}
        link={link}
        onOpenIncidents={openIncidents}
        onSelectIncident={selectIncident}
        onCloseIncident={closeIncident}
      />

      <TopHeader
        crumb={CRUMB[currentTab]}
        openIncidentCount={openCount}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenIncidents={openIncidents}
        onJump={setCurrentTab}
      />

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
          openedAt={isIncidentOpen(incident) ? openedAt[incident.incident_id] ?? null : null}
          esgLedger={esgLedger}
          onRefreshIncident={refreshIncident}
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
