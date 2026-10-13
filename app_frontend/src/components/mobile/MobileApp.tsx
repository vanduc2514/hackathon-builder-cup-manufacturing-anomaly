import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { IncidentState } from '../../types';
import type {
  EvidenceItem,
  MobileNotification,
  TechnicianProfile,
  WorkOrder,
  WorkStage,
} from '../../types/mobile';
import { dataUrlToBlob, uploadIncidentEvidence } from '../../api/kaizenApi';
import { useTelemetry } from '../../hooks/useTelemetry';
import MobileNav, { type MobileTab } from './MobileNav';
import MobileWorkList from './MobileWorkList';
import MobileEvidenceDetail from './MobileEvidenceDetail';
import MobileEvidenceCapture from './MobileEvidenceCapture';
import MobileFixDetail from './MobileFixDetail';
import MobileFixLive from './MobileFixLive';
import MobileWorkStatus from './MobileWorkStatus';
import MobileNotifications from './MobileNotifications';
import MobileSettings from './MobileSettings';
import {
  INITIAL_NOTIFICATIONS,
  INITIAL_PROFILE,
  INITIAL_WORK_ORDERS,
  type LiveCapture,
  applyIncident,
  getLeadName,
} from './mobileData';
import './mobile.css';

type Route =
  | { name: 'evidence'; id: string }
  | { name: 'capture'; id: string; itemId: string }
  | { name: 'fix'; id: string }
  | { name: 'live'; id: string }
  | { name: 'status'; id: string };

interface Toast {
  text: string;
  tone: 'ok' | 'error';
}

interface MobileAppProps {
  incident?: IncidentState | null;
}

function nowTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function routeFor(order: WorkOrder): Route {
  if (order.stage !== 'active') return { name: 'status', id: order.id };
  return order.kind === 'evidence' ? { name: 'evidence', id: order.id } : { name: 'fix', id: order.id };
}

const NO_CAPTURES: Record<string, LiveCapture> = {};

type NewNotification = Omit<MobileNotification, 'id' | 'time' | 'group' | 'unread'>;

/** Notification for a backend status change of the live incident, if that status deserves one. */
function statusNotification(incident: IncidentState): NewNotification | null {
  const machine = incident.suspect_machine ?? 'the line';
  const workId = incident.incident_id;
  switch (incident.status) {
    case 'awaiting_evidence':
      return {
        icon: 'photo_camera',
        tone: 'red',
        title: `Evidence needed · ${machine}`,
        body: incident.diagnostic_request ?? `Incident #${workId} needs a close-up photo.`,
        workId,
      };
    case 'repairing':
      return {
        icon: 'build',
        tone: 'indigo',
        title: `Repair ready · ${machine}`,
        body: incident.root_cause ?? `Root cause confirmed for #${workId}.`,
        workId,
      };
    case 'verifying':
      return {
        icon: 'fact_check',
        tone: 'blue',
        title: 'Verifying parts',
        body: `Inline camera is checking ${incident.verification_target} parts on ${machine}.`,
        workId,
      };
    case 'closed':
      return incident.approved
        ? null
        : {
            icon: 'task_alt',
            tone: 'blue',
            title: 'Parts verified · awaiting lead',
            body: `${incident.verification_count}/${incident.verification_target} good parts on ${machine}. Waiting for sign-off.`,
            workId,
          };
    case 'escalated':
    case 'error':
      return {
        icon: 'warning',
        tone: 'red',
        title: `Escalated · #${workId}`,
        body: incident.status_reason ?? 'The AI escalated this incident.',
        workId,
      };
    case 'dismissed':
      return {
        icon: 'block',
        tone: 'orange',
        title: `Dismissed · #${workId}`,
        body: incident.status_reason ?? 'No anomaly confirmed.',
        workId,
      };
    default:
      return null;
  }
}

/** Technician mobile app shell: tab state, Work List navigation stack, and shared data. */
export default function MobileApp({ incident }: MobileAppProps): React.ReactElement {
  const [tab, setTab] = useState<MobileTab>('work-list');
  const [workTab, setWorkTab] = useState<WorkStage>('active');
  const [stack, setStack] = useState<Route[]>([]);
  const [baseOrders, setBaseOrders] = useState<WorkOrder[]>(INITIAL_WORK_ORDERS);
  const [notifications, setNotifications] = useState<MobileNotification[]>(INITIAL_NOTIFICATIONS);
  const [profile, setProfile] = useState<TechnicianProfile>(INITIAL_PROFILE);
  const [toast, setToast] = useState<Toast | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Photos taken for the live incident, keyed by incident so a new incident starts clean.
  const [liveCaptures, setLiveCaptures] = useState<{ incidentId: string; items: Record<string, LiveCapture> }>({
    incidentId: '',
    items: {},
  });
  // Handover notes have no backend endpoint yet; they stay on this device.
  const [handoverNotes, setHandoverNotes] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const prevApprovedRef = useRef<boolean>(false);
  const seenAlertsRef = useRef<Set<string>>(new Set());

  const telemetry = useTelemetry(incident?.suspect_machine);
  const leadName = getLeadName(profile, incident);
  const captures = liveCaptures.incidentId === incident?.incident_id ? liveCaptures.items : NO_CAPTURES;
  const orders = useMemo(
    () => applyIncident(baseOrders, incident, leadName, telemetry, captures),
    [baseOrders, incident, leadName, telemetry, captures],
  );

  const initials =
    profile.fullName
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'ME';

  const route = tab === 'work-list' ? stack[stack.length - 1] : undefined;
  const order = route ? orders.find((o) => o.id === route.id) : undefined;
  const fullScreen = route?.name === 'capture' || route?.name === 'live';

  const notify = (n: NewNotification, unread = true) =>
    setNotifications((prev) => [
      { ...n, id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time: 'now', group: 'Today', unread },
      ...prev,
    ]);

  // Notify on backend status changes and on shift-leader approval of the live incident.
  useEffect(() => {
    if (!incident || !incident.incident_id || incident.status === 'normal') {
      prevStatusRef.current = incident?.status;
      prevApprovedRef.current = Boolean(incident?.approved);
      return;
    }
    if (prevStatusRef.current !== incident.status) {
      prevStatusRef.current = incident.status;
      const n = statusNotification(incident);
      if (n) notify(n);
    }
    if (incident.approved && !prevApprovedRef.current) {
      notify({
        icon: 'verified',
        tone: 'green',
        title: `Approved by ${leadName}`,
        body: `Incident #${incident.incident_id} on ${incident.suspect_machine ?? 'the line'} is signed off.`,
        workId: incident.incident_id,
      });
    }
    prevApprovedRef.current = incident.approved;
  }, [incident?.status, incident?.approved, incident?.incident_id]);

  // One notification per new telemetry alert on the incident board.
  useEffect(() => {
    const alerts = incident?.telemetry_alerts ?? [];
    alerts.forEach((a) => {
      const key = `${a.machine_id}|${a.timestamp}|${a.metric_name}`;
      if (seenAlertsRef.current.has(key)) return;
      seenAlertsRef.current.add(key);
      notify({
        icon: 'sensors',
        tone: 'orange',
        title: `Sensor alert · ${a.machine_id}`,
        body: a.message,
        workId: incident?.status !== 'normal' ? incident?.incident_id : undefined,
      });
    });
  }, [incident?.telemetry_alerts]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab, stack.length, workTab]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 4500 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (text: string, tone: Toast['tone'] = 'ok') => setToast({ text, tone });
  const push = (r: Route) => setStack((s) => [...s, r]);
  const pop = () => setStack((s) => s.slice(0, -1));

  const updateOrder = (id: string, fn: (o: WorkOrder) => WorkOrder) =>
    setBaseOrders((list) => list.map((o) => (o.id === id ? fn(o) : o)));

  const handleTab = (t: MobileTab) => {
    if (t === 'work-list' && tab === 'work-list') setStack([]);
    setTab(t);
  };

  const saveCapture = (target: WorkOrder, itemId: string, thumbnail: string) => {
    const capturedAt = nowTime();
    if (target.live) {
      setLiveCaptures((prev) => ({
        incidentId: target.id,
        items: { ...(prev.incidentId === target.id ? prev.items : {}), [itemId]: { thumbnail, capturedAt } },
      }));
    } else {
      updateOrder(target.id, (o) => ({
        ...o,
        evidence: o.evidence.map(
          (e): EvidenceItem =>
            e.id === itemId ? { ...e, captured: true, source: 'technician', thumbnail, capturedAt } : e,
        ),
      }));
    }
    pop();
    showToast('Saved to evidence');
  };

  /** Demo orders only: moves the order to Processing locally. */
  const moveDemoToProcessing = (o: WorkOrder, target: number, aiNote: string, message: string) => {
    updateOrder(o.id, (x) => ({
      ...x,
      stage: 'processing',
      processing: { submittedAt: nowTime(), verified: 0, target, lead: leadName, aiNote },
    }));
    notify(
      {
        icon: 'send',
        tone: 'blue',
        title: `Sent to lead · ${o.machine}`,
        body: message,
        workId: o.id,
      },
      false,
    );
    setStack([]);
    setWorkTab('processing');
    showToast(message);
  };

  /** Uploads the technician photo for the live incident to `POST /api/incidents/evidence`. */
  const submitEvidence = async (target: WorkOrder) => {
    if (!target.live) {
      moveDemoToProcessing(target, 0, 'Demo work order: evidence kept on this device.', 'Demo order · not sent to the backend');
      return;
    }
    if (!target.live.canSubmitEvidence) {
      showToast('The AI is not waiting for evidence right now', 'error');
      return;
    }
    const photos = target.evidence.filter((e) => e.guidance && e.captured && e.thumbnail?.startsWith('data:'));
    if (photos.length === 0) {
      showToast('Take the requested photo first', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const photo = photos[0];
      const blob = await dataUrlToBlob(photo.thumbnail as string);
      const res = await uploadIncidentEvidence(
        blob,
        `${target.id}-${photo.id}.jpg`,
        `Technician photo "${photo.label}" for #${target.id} on ${target.machine}, taken ${photo.capturedAt}.`,
      );
      setLiveCaptures({ incidentId: target.id, items: {} });
      notify(
        {
          icon: 'send',
          tone: 'blue',
          title: `Evidence sent · ${target.machine}`,
          body: res.evidence.analysis,
          workId: target.id,
        },
        false,
      );
      setStack([]);
      showToast('Evidence received · AI is re-analysing');
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      showToast(`Upload failed: ${reason}. Try again.`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Finishes the guided repair. There is no repair-complete endpoint: the backend records the
   * repair itself (`record_resolution`). Posting to the evidence endpoint here would push the
   * incident back to `analyzing`, so nothing is sent; the handover note stays on this device.
   */
  const submitRepair = (target: WorkOrder, notes: string) => {
    if (!target.live) {
      const aiNote = notes ? `Repair notes: ${notes}` : 'Demo work order: all steps marked done.';
      moveDemoToProcessing(target, 50, aiNote, 'Demo order · not sent to the backend');
      return;
    }
    if (notes.trim()) setHandoverNotes((prev) => ({ ...prev, [target.id]: notes.trim() }));
    setStack([]);
    if (target.live.repairDone) {
      setWorkTab('processing');
      showToast('Repair recorded · inline camera is verifying parts');
    } else {
      showToast('Steps done · the AI records the repair when the copilot finishes');
    }
  };

  const openNotification = (n: MobileNotification) => {
    setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    const target = n.workId ? orders.find((o) => o.id === n.workId) : undefined;
    if (!target) return;
    setWorkTab(target.stage);
    setStack([routeFor(target)]);
    setTab('work-list');
  };

  const renderWork = (): React.ReactNode => {
    if (!route || !order) {
      return (
        <MobileWorkList
          orders={orders}
          tab={workTab}
          initials={initials}
          onTabChange={setWorkTab}
          onOpen={(o) => push(routeFor(o))}
        />
      );
    }
    switch (route.name) {
      case 'evidence':
        return (
          <MobileEvidenceDetail
            order={order}
            submitting={submitting}
            onBack={pop}
            onCapture={(item) => push({ name: 'capture', id: order.id, itemId: item.id })}
            onSubmit={() => void submitEvidence(order)}
          />
        );
      case 'capture': {
        const item = order.evidence.find((e) => e.id === route.itemId);
        if (!item) return null;
        return (
          <MobileEvidenceCapture
            order={order}
            item={item}
            onClose={pop}
            onSave={(itemId, thumb) => saveCapture(order, itemId, thumb)}
          />
        );
      }
      case 'fix':
        return <MobileFixDetail order={order} onBack={pop} onStart={() => push({ name: 'live', id: order.id })} />;
      case 'live':
        return (
          <MobileFixLive
            order={order}
            voiceGuidance={profile.voiceGuidance}
            onExit={pop}
            onSubmit={(notes) => submitRepair(order, notes)}
          />
        );
      case 'status':
        return (
          <MobileWorkStatus
            order={order}
            handoverNote={handoverNotes[order.id]}
            onBack={pop}
            onPingLead={() => showToast(`Reminder sent to ${order.processing?.lead ?? leadName}`)}
          />
        );
      default:
        return null;
    }
  };

  const unread = notifications.filter((n) => n.unread).length;

  return (
    <div className="m-app">
      <div className="m-bg" aria-hidden>
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <div className={`m-statusbar ${fullScreen ? 'is-dark' : ''}`} aria-hidden>
        <span>9:41</span>
        <span className="icons">
          <span className="material-symbols-outlined">signal_cellular_alt</span>
          <span className="material-symbols-outlined">wifi</span>
          <span className="material-symbols-outlined">battery_full</span>
        </span>
      </div>

      <main ref={scrollRef} className={`m-scroll ${fullScreen ? 'is-full' : ''}`}>
        {tab === 'work-list' && renderWork()}
        {tab === 'notifications' && (
          <MobileNotifications
            items={notifications}
            initials={initials}
            onOpen={openNotification}
            onMarkAllRead={() => setNotifications((list) => list.map((n) => ({ ...n, unread: false })))}
          />
        )}
        {tab === 'settings' && <MobileSettings profile={profile} initials={initials} onChange={setProfile} />}
      </main>

      {toast && (
        <div className={`m-toast ${toast.tone === 'error' ? 'is-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span className="material-symbols-outlined ms-fill">{toast.tone === 'error' ? 'error' : 'check_circle'}</span>
          {toast.text}
        </div>
      )}

      <MobileNav activeTab={tab} onTabChange={handleTab} notificationCount={unread} onDark={fullScreen} />
    </div>
  );
}
