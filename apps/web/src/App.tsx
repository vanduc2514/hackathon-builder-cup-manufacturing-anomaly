// App shell: owns the SSE incident subscription, backend health, ESG ledger, simulation polling and the glass chrome.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar, { type BackendLink, type DashboardTab, type IncidentTab } from './components/Sidebar';
import TopHeader from './components/TopHeader';
import DemoController from './components/DemoController';
import Dashboard from './pages/Dashboard';
import { ACTIVE_PRODUCT, productIncidents, STATUS_LABEL } from './lib/incident';
import { isIncidentOpen, toEsgTotals, toLedgerEntries } from './lib/fleet';
import { streamUrl } from './lib/api';
import { authFetch, withToken } from './lib/auth';
import type { EsgLedgerResponse, IncidentState, SimulationStatusResponse } from './types';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  text: string;
  tone: ToastTone;
}

/** Open incident sub-tab plus the board snapshot taken when it was opened (live data wins while ids match). */
interface OpenIncidentTab extends IncidentTab {
  snapshot: IncidentState;
}

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
  const [ledger, setLedger] = useState<EsgLedgerResponse | null>(null);
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({});
  const [soundOn, setSoundOn] = useState<boolean>(() => readStorage<boolean>(SOUND_KEY, true));
  const [navOpen, setNavOpen] = useState<boolean>(false);
  const alertedId = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setNavOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  // Track previous incident status and notify on passive state transitions received via SSE.
  const prevIncidentRef = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!incident) return;
    const prev = prevIncidentRef.current;
    const currentId = incident.incident_id;
    const currentStatus = incident.status;

    if (prev && prev.id === currentId && prev.status !== currentStatus) {
      const label = STATUS_LABEL[currentStatus] || currentStatus;
      const tone: ToastTone =
        currentStatus === 'error' || currentStatus === 'escalated'
          ? 'error'
          : currentStatus === 'closed'
            ? 'success'
            : 'info';
      notify(`Incident #${currentId}: Transitioned to ${label}`, tone);
    } else if (prev && prev.id !== currentId && currentStatus !== 'normal') {
      const label = STATUS_LABEL[currentStatus] || currentStatus;
      notify(`New incident #${currentId} detected on ${incident.suspect_machine || 'Line-01'} (${label})`, 'info');
    }

    prevIncidentRef.current = { id: currentId, status: currentStatus };
  }, [incident, notify]);

  const refreshLedger = useCallback(async () => {
    try {
      const res = await authFetch('/api/impact/ledger');
      if (res.ok) {
        const data = (await res.json()) as EsgLedgerResponse;
        setLedger(data);
      }
    } catch (err) {
      console.warn('ESG ledger fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  useEffect(() => {
    refreshLedger();
  }, [incident?.incident_id, incident?.status, incident?.approved, refreshLedger]);

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
    const entries = Object.values(productIncidents(incident));
    if (entries.length > 0) {
      openIncidentTab(entries[0].incident_id);
      return;
    }
    const last = incidentTabs[incidentTabs.length - 1];
    if (last) {
      setActiveIncidentId(last.id);
      setCurrentTab('incident-detail');
      return;
    }
    setActiveIncidentId(null);
    setCurrentTab('incident-detail');
  };

  const selectIncident = useCallback((id: string) => {
    setActiveIncidentId(id);
    setCurrentTab('incident-detail');
  }, []);

  const handleSelectTabFromSidebar = useCallback((tab: DashboardTab) => {
    setCurrentTab(tab);
    setNavOpen(false);
  }, []);

  const handleOpenIncidentsFromSidebar = useCallback(() => {
    openIncidents();
    setNavOpen(false);
  }, [openIncidents]);

  const handleSelectIncidentFromSidebar = useCallback((id: string) => {
    selectIncident(id);
    setNavOpen(false);
  }, [selectIncident]);

  const closeIncident = (id: string) => {
    const remaining = incidentTabs.filter((t) => t.id !== id);
    setIncidentTabs(remaining);
    if (activeIncidentId !== id) return;
    const next = remaining[remaining.length - 1];
    setActiveIncidentId(next?.id ?? null);
    if (currentTab === 'incident-detail') setCurrentTab(next ? 'incident-detail' : 'overview');
  };

  const esgLedger = useMemo(() => (ledger ? toLedgerEntries(ledger) : []), [ledger]);
  const esgTotals = useMemo(
    () =>
      toEsgTotals(
        ledger?.totals ?? {
          incidents: 0,
          scrap_avoided: 0,
          downtime_minutes: 0,
          energy_kwh: 0,
          co2_kg: 0,
          energy_co2_kg: 0,
          material_co2_kg: 0,
          cost_savings_usd: 0,
        },
      ),
    [ledger],
  );
  const downtimeMinutes = ledger?.totals.downtime_minutes ?? 0;
  const factoryType = ledger?.factory_type ?? 'aluminum_cnc';

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
        onSelectTab={handleSelectTabFromSidebar}
        incidentTabs={incidentTabs}
        activeIncidentId={activeIncidentId}
        openIncidentCount={openCount}
        link={link}
        onOpenIncidents={handleOpenIncidentsFromSidebar}
        onSelectIncident={handleSelectIncidentFromSidebar}
        onCloseIncident={closeIncident}
        navOpen={navOpen}
        onCloseNav={() => setNavOpen(false)}
      />

      {navOpen && (
        <div
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <TopHeader
        crumb={CRUMB[currentTab]}
        openIncidentCount={openCount}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenIncidents={openIncidents}
        onJump={setCurrentTab}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
      />

      <main className="app-main">
        <Dashboard
          incident={incident}
          currentTab={currentTab}
          openIncident={openIncident}
          openedAt={isIncidentOpen(incident) ? openedAt[incident.incident_id] ?? null : null}
          esgLedger={esgLedger}
          esgTotals={esgTotals}
          downtimeMinutes={downtimeMinutes}
          factoryType={factoryType}
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
          refreshLedger();
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
