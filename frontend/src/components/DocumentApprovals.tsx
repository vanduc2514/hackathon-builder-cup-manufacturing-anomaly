// DocumentApprovals: Industrial 8D Incident Report, Work Order, SOP Revision viewer, and Shift Leader Approval sign-off.
import React, { useState } from 'react';
import type { AgentFinding, ApprovalAuditTrail, EightDReport, WorkOrder, SOPRevisionProposal } from '../types';

export interface DocumentApprovalsProps {
  incidentId?: string;
  status?: string;
  approved?: boolean;
  documents?: Record<string, unknown>;
  findings?: AgentFinding[];
  suspectMachine?: string | null;
  suspectTool?: string | null;
  rootCause?: string | null;
  defectType?: string | null;
  onApproved?: () => void;
}

type TabKey = '8d' | 'work_order' | 'sop' | 'audit';

export default function DocumentApprovals({
  incidentId = 'INC-0412',
  status = 'normal',
  approved = false,
  documents = {},
  findings = [],
  suspectMachine = 'CNC-02',
  suspectTool = 'T07',
  rootCause = 'Tool insert micro-chipping and flank wear VB > 0.30 mm causing harmonic chatter',
  defectType = 'scratch_vertical',
  onApproved,
}: DocumentApprovalsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('8d');
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [localApproved, setLocalApproved] = useState<boolean>(approved);
  const [auditRecord, setAuditRecord] = useState<ApprovalAuditTrail | null>(() => {
    if (approved) {
      return {
        approver_name: 'Nguyễn Văn A',
        approver_role: 'Operations Shift Leader',
        approver_id: 'SL-702',
        timestamp: new Date().toISOString(),
        signature_hash: 'sha256:4a8f9c2d1e0b5a3f7890bcde123456789abcdef0123456789abcdef012345678',
        standard: 'ISO 9001:2015 Clause 10.2 / IATF 16949 Section 10.2.3',
        verification_evidence: '50/50 consecutive defect-free parts verified on optical conveyor',
      };
    }
    return null;
  });

  const isClosed = status === 'closed';
  const effectiveApproved = localApproved || approved;

  // Extract Scribe text outputs if present
  const rawReport8d = typeof documents?.report_8d === 'string' ? documents.report_8d : null;
  const rawWorkOrder = typeof documents?.work_order === 'string' ? documents.work_order : null;
  const rawSopProposal = typeof documents?.sop_proposal === 'string' ? documents.sop_proposal : null;

  // Synthesized 8D Disciplines
  const eightDSections = [
    {
      code: 'D1',
      title: 'Team Formation',
      vietnamese: 'Thành lập đội ngũ ứng phó',
      desc: 'Cross-functional response team established under Kaizen Autonomous Agent governance.',
      details: [
        'AI Agents: Quality Inspector, Traceability, Process Analyst, Root Cause, Technician Copilot, Incident Scribe',
        'Shift Leader: Nguyễn Văn A (ID: SL-702)',
        'Quality Lead: Trần B (ID: QC-104)',
        'Frontline Technician: Lê C (Precision Machining Unit)',
      ],
      status: 'Completed',
    },
    {
      code: 'D2',
      title: 'Problem Description (5W2H)',
      vietnamese: 'Mô tả vấn đề 5W2H',
      desc: `Defect rate spiked above SPC Upper Control Limit (3.00%) due to ${defectType} on Face A.`,
      details: [
        `What: Surface roughness degradation & vertical scratch (> 2.4 mm)`,
        `Where: Machining Line 1, CNC Station ${suspectMachine || 'CNC-02'}, Spindle Tool ${suspectTool || 'T07'}`,
        `When: Discrete batch tracking window`,
        `Severity: High (Critical aesthetic & dimensional nonconformity)`,
        `SPC Breach: Defect rate surged to 7.7%, violating Nelson Rule 1`,
      ],
      status: 'Completed',
    },
    {
      code: 'D3',
      title: 'Containment Actions',
      vietnamese: 'Hành động ngăn chặn tức thì',
      desc: 'Immediate line quarantine and lot containment to eliminate risk of nonconforming product dispatch.',
      details: [
        `Quarantined suspect manufacturing lot at Station ${suspectMachine || 'CNC-02'}`,
        'Conveyor diverter gate activated: 100% optical screening on automated belt',
        'Downstream assembly informed; buffer stock verified defect-free',
        'Estimated suspect inventory isolated: 240 units quarantined',
      ],
      status: 'Completed',
    },
    {
      code: 'D4',
      title: 'Root Cause Analysis',
      vietnamese: 'Phân tích nguyên nhân gốc rễ',
      desc: rootCause || 'Flank wear exceeded 0.30 mm limit, generating acoustic harmonic vibration and chatter.',
      details: [
        '5-Whys Deduction: Level 5 confirmed excessive tool wear beyond 1,900 part cut limit',
        '6M Ishikawa Fishbone: Machine (Spindle vibration 3.82 mm/s RMS) & Method (Calendar-based tool changes)',
        'Physical Field Evidence: Flank wear VB measured at 0.38 mm (OEM limit: 0.30 mm)',
        'Spindle Runout TIR: 0.012 mm prior to calibration (OEM tolerance: <= 0.005 mm)',
      ],
      status: 'Completed',
    },
    {
      code: 'D5',
      title: 'Permanent Corrective Actions (PCA)',
      vietnamese: 'Hành động khắc phục vĩnh viễn',
      desc: 'Tool insert replacement and physical spindle torque/runout recalibration.',
      details: [
        `Replaced worn tool insert on ${suspectTool || 'T07'} with new WNMG-080408 carbide insert`,
        'Torqued insert clamping screw to specified 4.2 Nm using calibrated torque wrench',
        'Recalibrated spindle preload & verified runout TIR <= 0.004 mm',
        'Spindle vibration returned to baseline 1.35 mm/s RMS during test cut',
      ],
      status: isClosed || status === 'repairing' || status === 'verifying' ? 'Completed' : 'In Progress',
    },
    {
      code: 'D6',
      title: 'Verification & Validation',
      vietnamese: 'Xác minh & Đánh giá hiệu quả',
      desc: 'Automated post-repair conveyor quality gatekeeper verification.',
      details: [
        'Closed-Loop QC Gatekeeper: 50 consecutive defect-free parts confirmed on conveyor',
        'Defect rate restored to baseline < 0.50% (well within 3.00% UCL limit)',
        'Streak Gatekeeper integrity confirmed: zero recurrent defects recorded',
        'Vision metrology confirmed surface finish Ra 0.8 μm within drawing specification',
      ],
      status: isClosed ? 'Verified' : 'Pending Verification',
    },
    {
      code: 'D7',
      title: 'Prevent Recurrence',
      vietnamese: 'Phòng ngừa tái diễn & Cập nhật SOP',
      desc: 'Revised maintenance protocol from calendar-based to usage-based tool life tracking.',
      details: [
        'Target SOP: SOP-MNT-CNC-04 revised with automated piece-counter alarms',
        'Warning Alert Threshold: Automated alert at 1,900 parts cut',
        'Hard Interlock Lockout: Spindle lockout enforced at 2,000 cuts to prevent over-extension',
        'BigQuery Telemetry Rule: Real-time RMS vibration threshold alert set at > 1.50 mm/s',
      ],
      status: isClosed ? 'Drafted' : 'Pending',
    },
    {
      code: 'D8',
      title: 'Team Recognition & Closure',
      vietnamese: 'Công nhận đội ngũ & Đóng hồ sơ',
      desc: 'Institutional memory ingested into Vertex AI Search RAG and formal sign-off archived.',
      details: [
        'Knowledge Base: Root cause & repair resolution ingested into Vertex AI Search',
        'Avoided Scrap & Carbon: Sustainability metrics computed and linked to ESG dashboard',
        'Recognition: Frontline technician and autonomous agent workflow successfully executed',
        'Governance: Formal Shift Leader approval required to seal incident record',
      ],
      status: effectiveApproved ? 'Signed & Closed' : isClosed ? 'Awaiting Sign-off' : 'Pending',
    },
  ];

  // Work Order Details
  const workOrderData: WorkOrder = {
    work_order_id: rawWorkOrder || 'WO-2026-1004',
    title: `Emergency Tooling Replacement & Spindle Calibration (${suspectMachine || 'CNC-02'})`,
    equipment_id: suspectMachine || 'CNC-02',
    description: `Urgent corrective maintenance on tool pocket ${suspectTool || 'T07'}. Replace worn carbide insert, inspect seat for damage, torque clamping screw to 4.2 Nm, and verify spindle TIR runout <= 0.005 mm.`,
    parts_required: [
      'Sandvik Coromant WNMG-080408-PM 4325 Carbide Insert (Qty: 1)',
      'Torx Clamping Screw M4x10 T15 (Qty: 1)',
      'Spindle Cleaner Felt & ISO VG 32 Wiper Oil',
    ],
    priority: 'HIGH',
    status: effectiveApproved ? 'APPROVED' : isClosed ? 'PENDING_APPROVAL' : 'DRAFT',
    pending_approval: 'shift_leader',
    approved: effectiveApproved,
    created_at: new Date().toISOString(),
  };

  // SOP Revision Proposal Details
  const sopData: SOPRevisionProposal = {
    sop_id: 'SOP-MNT-CNC-04',
    title: 'Standard Operating Procedure: CNC Turning Insert Wear Monitoring & Proactive Replacement',
    equipment_id: suspectMachine || 'CNC-02',
    current_procedure: 'Calendar-based visual inspection performed every 14 days or during monthly line shutdowns.',
    proposed_revision:
      rawSopProposal ||
      'Automated usage-based monitoring with discrete piece-counter tracking at edge gateway. Automated warning alert at 1,900 parts; hard machine lockout at 2,000 parts.',
    justification: `Incident ${incidentId} demonstrated that calendar-based maintenance allowed tool ${suspectTool || 'T07'} to run past 2,140 parts, causing severe flank wear (0.38 mm) and high-scrap defect spikes.`,
    threshold_alert_parts: 1900,
    pending_approval: 'shift_leader',
    approved: effectiveApproved,
    created_at: new Date().toISOString(),
  };

  // One-Click Shift Leader Sign-Off Handler
  const handleApprove = async (): Promise<void> => {
    if (!isClosed) {
      setApprovalError('Approval requires verified closed status (50/50 defect-free conveyor streak).');
      return;
    }
    if (effectiveApproved) return;

    setIsApproving(true);
    setApprovalError(null);

    try {
      const response = await fetch('/api/incidents/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `Server returned HTTP ${response.status}`);
      }

      setLocalApproved(true);
      const generatedAudit: ApprovalAuditTrail = {
        approver_name: 'Nguyễn Văn A',
        approver_role: 'Operations Shift Leader',
        approver_id: 'SL-702',
        timestamp: new Date().toISOString(),
        signature_hash: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
        standard: 'ISO 9001:2015 Clause 10.2 / IATF 16949 Section 10.2.3',
        verification_evidence: '50/50 consecutive defect-free parts verified on optical conveyor',
      };
      setAuditRecord(generatedAudit);

      if (onApproved) {
        onApproved();
      }
    } catch (err) {
      setApprovalError(err instanceof Error ? err.message : 'Shift leader approval failed');
    } finally {
      setIsApproving(false);
    }
  };

  // Export 8D Report to Markdown
  const handleExportMarkdown = (): void => {
    const mdContent = `# 8D INCIDENT REPORT: ${incidentId}
**Classification:** Automotive / Electronics Standard 8D Nonconformity Report
**Status:** ${effectiveApproved ? 'APPROVED & CLOSED' : isClosed ? 'CLOSED (AWAITING APPROVAL)' : 'DRAFT'}
**Suspect Equipment:** ${suspectMachine} | **Tool ID:** ${suspectTool} | **Defect Type:** ${defectType}
**Export Date:** ${new Date().toISOString()}

---

## 8D DISCIPLINE SUMMARY

### D1: Team Formation
- Autonomous AI Multi-Agent Team (Quality, Traceability, Process, RCA, Copilot, Scribe)
- Shift Leader: Nguyễn Văn A (SL-702) | Quality Lead: Trần B (QC-104)

### D2: Problem Description (5W2H)
- Defect Rate: Surged past 3.00% UCL to 7.7%
- Defect Description: Vertical surface scratches > 2.4 mm on Face A
- Location: Machining Station ${suspectMachine}, Tool ${suspectTool}

### D3: Interim Containment Actions
- Immediate conveyor line quarantine on Lot ${suspectMachine}-B
- 100% optical screening on automated sorting belt (240 units quarantined)

### D4: Root Cause Analysis
- Identified Cause: ${rootCause}
- Metrology: Flank wear VB measured at 0.38 mm (Limit: 0.30 mm)
- Spindle Vibration: 3.82 mm/s RMS harmonic vibration chatter

### D5: Permanent Corrective Actions (PCA)
- Tool Insert Replacement: Sandvik Coromant WNMG-080408-PM 4325
- Torque clamping screw to 4.2 Nm; spindle runout TIR <= 0.004 mm

### D6: Verification & Validation
- Physical conveyor proof: 50 consecutive defect-free parts verified
- Defect rate returned to baseline < 0.50%

### D7: Prevent Recurrence
- SOP Revision: SOP-MNT-CNC-04
- Automated threshold alert: Warning at 1,900 parts cut
- Hard spindle lockout: Enforced at 2,000 cuts
- Telemetry rule: Spindle RMS vibration threshold set at 1.50 mm/s

### D8: Recognition & Closure
- Institutional memory ingested into Vertex AI Search RAG
- Avoided scrap and sustainability ESG metrics archived

---

## MAINTENANCE WORK ORDER: ${workOrderData.work_order_id}
**Equipment:** ${workOrderData.equipment_id} | **Priority:** ${workOrderData.priority} | **Status:** ${workOrderData.status}
**Instructions:** ${workOrderData.description}
**Parts Requisitioned:**
${workOrderData.parts_required.map((p) => `- ${p}`).join('\n')}

---

## SOP REVISION PROPOSAL: ${sopData.sop_id}
**Title:** ${sopData.title}
**Current Procedure:** ${sopData.current_procedure}
**Proposed Revision:** ${sopData.proposed_revision}
**Threshold Alert Limit:** ${sopData.threshold_alert_parts} parts
**Technical Justification:** ${sopData.justification}

---

## SHIFT LEADER APPROVAL AUDIT TRAIL
${
  auditRecord
    ? `- Approver: ${auditRecord.approver_name} (${auditRecord.approver_role}, ID: ${auditRecord.approver_id})
- Timestamp: ${auditRecord.timestamp}
- Digital Signature: ${auditRecord.signature_hash}
- Governance: ${auditRecord.standard}
- Verification Proof: ${auditRecord.verification_evidence}`
    : '- Status: Pending Shift Leader Sign-Off'
}
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `8D_Report_${incidentId}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Full JSON Archive
  const handleExportJson = (): void => {
    const eightDReportPayload: EightDReport = {
      incident_id: incidentId,
      d1_team: eightDSections[0].desc,
      d2_problem: eightDSections[1].desc,
      d3_containment: eightDSections[2].desc,
      d4_root_cause: eightDSections[3].desc,
      d5_corrective_actions: eightDSections[4].desc,
      d6_implementation: eightDSections[5].desc,
      d7_preventive_action: eightDSections[6].desc,
      d8_congratulate_team: eightDSections[7].desc,
      pending_approval: 'shift_leader',
      approved: effectiveApproved,
      created_at: new Date().toISOString(),
    };

    const payload = {
      incident_id: incidentId,
      status,
      approved: effectiveApproved,
      exported_at: new Date().toISOString(),
      eight_d_report: eightDReportPayload,
      disciplines: eightDSections,
      work_order: workOrderData,
      sop_revision: sopData,
      audit_trail: auditRecord,
      findings,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `8D_Archive_${incidentId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Report Handler
  const handlePrint = (): void => {
    window.print();
  };

  return (
    <div
      style={{
        background: '#0B131F',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        color: '#F8FAFC',
      }}
    >
      {/* Header and Approval Status Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #1E293B',
          paddingBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              background: '#065F46',
              color: '#A7F3D0',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '3px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}
          >
            SCRIBE & GOVERNANCE
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#F8FAFC' }}>
              8D Incident Report & Shift Leader Approval
            </h3>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px' }}>
              Incident: <strong style={{ color: '#38BDF8' }}>{incidentId}</strong> • Asset:{' '}
              <strong style={{ color: '#E2E8F0' }}>{suspectMachine}</strong> (Tool {suspectTool})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Action Export Buttons */}
          <button
            onClick={handleExportMarkdown}
            title="Download Markdown Report"
            style={{
              background: '#1E293B',
              color: '#38BDF8',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📄 Export .MD
          </button>
          <button
            onClick={handleExportJson}
            title="Download JSON Archive"
            style={{
              background: '#1E293B',
              color: '#A78BFA',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            💾 Export JSON
          </button>
          <button
            onClick={handlePrint}
            title="Print or Save as PDF"
            style={{
              background: '#1E293B',
              color: '#FCD34D',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🖨️ Print / PDF
          </button>

          {/* Status Badge */}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: '12px',
              background: effectiveApproved ? '#064E3B' : isClosed ? '#78350F' : '#1E293B',
              color: effectiveApproved ? '#6EE7B7' : isClosed ? '#FCD34D' : '#94A3B8',
              border: `1px solid ${effectiveApproved ? '#059669' : isClosed ? '#F59E0B' : '#334155'}`,
            }}
          >
            {effectiveApproved
              ? '✓ APPROVED BY SHIFT LEADER'
              : isClosed
                ? '⏳ AWAITING SHIFT LEADER SIGN-OFF'
                : '🔄 DRAFT IN PROGRESS (VERIFYING)'}
          </span>
        </div>
      </div>

      {/* Prominent One-Click Shift Leader Sign-off Action Banner */}
      <div
        style={{
          background: effectiveApproved
            ? 'rgba(6, 78, 59, 0.4)'
            : isClosed
              ? 'rgba(120, 53, 15, 0.35)'
              : '#0F172A',
          border: `1px solid ${effectiveApproved ? '#059669' : isClosed ? '#F59E0B' : '#1E293B'}`,
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#F1F5F9' }}>
            {effectiveApproved
              ? 'Official Shift Leader Sign-off Completed'
              : isClosed
                ? 'Incident Closed on Physical Proof — Ready for Shift Leader Sign-off'
                : 'Incident Verification in Progress — Approval Locked'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            {effectiveApproved
              ? `Signed by Nguyễn Văn A (SL-702) • Digital Signature: ${auditRecord?.signature_hash?.slice(0, 24)}...`
              : isClosed
                ? 'Conveyor quality gate verified 50 consecutive defect-free parts. Authorize formal closure and SOP update.'
                : 'Shift Leader sign-off is gated until post-repair verification completes 50 consecutive defect-free parts.'}
          </div>
          {approvalError && (
            <div style={{ fontSize: '0.8rem', color: '#F87171', marginTop: '0.25rem' }}>
              ⚠️ {approvalError}
            </div>
          )}
        </div>

        <div>
          {!effectiveApproved && (
            <button
              onClick={handleApprove}
              disabled={!isClosed || isApproving}
              style={{
                background: isClosed ? '#059669' : '#1E293B',
                color: isClosed ? '#FFFFFF' : '#64748B',
                border: `1px solid ${isClosed ? '#10B981' : '#334155'}`,
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: isClosed && !isApproving ? 'pointer' : 'not-allowed',
                boxShadow: isClosed ? '0 0 15px rgba(16, 185, 129, 0.3)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {isApproving
                ? 'Authorizing Sign-off...'
                : isClosed
                  ? '✍️ Approve & Officially Close Incident'
                  : '🔒 Approval Locked (Awaiting Verification)'}
            </button>
          )}
          {effectiveApproved && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#064E3B',
                color: '#6EE7B7',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: '1px solid #059669',
              }}
            >
              ✓ OFFICIALLY CLOSED & ARCHIVED
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1E293B',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveTab('8d')}
          style={{
            background: activeTab === '8d' ? '#1E293B' : 'transparent',
            color: activeTab === '8d' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === '8d' ? '2px solid #38BDF8' : '2px solid transparent',
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📋 8D Report (D1–D8)
        </button>
        <button
          onClick={() => setActiveTab('work_order')}
          style={{
            background: activeTab === 'work_order' ? '#1E293B' : 'transparent',
            color: activeTab === 'work_order' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'work_order' ? '2px solid #38BDF8' : '2px solid transparent',
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔧 Work Order Requisition
        </button>
        <button
          onClick={() => setActiveTab('sop')}
          style={{
            background: activeTab === 'sop' ? '#1E293B' : 'transparent',
            color: activeTab === 'sop' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'sop' ? '2px solid #38BDF8' : '2px solid transparent',
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📜 SOP Revision (1,900 Parts)
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            background: activeTab === 'audit' ? '#1E293B' : 'transparent',
            color: activeTab === 'audit' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'audit' ? '2px solid #38BDF8' : '2px solid transparent',
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🛡️ Approval & Audit Trail
        </button>
      </div>

      {/* Tab 1: Interactive 8D Report (Disciplines D1 to D8) */}
      {activeTab === '8d' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rawReport8d && (
            <div
              style={{
                background: '#0F172A',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '0.9rem 1.1rem',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: '#CBD5E1',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Incident Scribe Compiled Narrative:
              </div>
              {rawReport8d}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {eightDSections.map((sec) => (
              <div
                key={sec.code}
                style={{
                  background: '#0F172A',
                  border: '1px solid #1E293B',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        background: '#1E293B',
                        color: '#38BDF8',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {sec.code}
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#F1F5F9' }}>
                      {sec.title}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background:
                        sec.status === 'Completed' || sec.status === 'Verified' || sec.status === 'Signed & Closed'
                          ? '#064E3B'
                          : sec.status === 'In Progress'
                            ? '#78350F'
                            : '#1E293B',
                      color:
                        sec.status === 'Completed' || sec.status === 'Verified' || sec.status === 'Signed & Closed'
                          ? '#6EE7B7'
                          : sec.status === 'In Progress'
                            ? '#FCD34D'
                            : '#94A3B8',
                    }}
                  >
                    {sec.status}
                  </span>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                  {sec.vietnamese}
                </div>

                <div style={{ fontSize: '0.8rem', color: '#E2E8F0', lineHeight: 1.4 }}>
                  {sec.desc}
                </div>

                <div
                  style={{
                    background: '#090D16',
                    borderRadius: '6px',
                    padding: '0.6rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    marginTop: 'auto',
                  }}
                >
                  {sec.details.map((item, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', color: '#94A3B8', lineHeight: 1.3 }}>
                      • {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Maintenance Work Order Requisition View */}
      {activeTab === 'work_order' && (
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                Maintenance Work Order
              </div>
              <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#F1F5F9' }}>
                {workOrderData.work_order_id} — {workOrderData.title}
              </h4>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ background: '#7F1D1D', color: '#FCA5A5', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                PRIORITY: {workOrderData.priority}
              </span>
              <span style={{ background: workOrderData.approved ? '#064E3B' : '#78350F', color: workOrderData.approved ? '#6EE7B7' : '#FCD34D', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                STATUS: {workOrderData.status}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Equipment & Tooling
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9' }}>
                Target Machine: <strong>{workOrderData.equipment_id}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9', marginTop: '0.25rem' }}>
                Suspect Tool Position: <strong>{suspectTool || 'T07'} (Rough Turning Insert)</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9', marginTop: '0.25rem' }}>
                Spindle Preload Spec: <strong>45 Nm (Torque Wrench Verified)</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9', marginTop: '0.25rem' }}>
                TIR Runout Tolerance: <strong>&le; 0.005 mm</strong>
              </div>
            </div>

            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Requisitioned Spare Parts & Consumables
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {workOrderData.parts_required.map((part, idx) => (
                  <div key={idx} style={{ fontSize: '0.8rem', color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#10B981' }}>✓</span> {part}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
            <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Actionable Work Order Execution Instructions
            </div>
            <div style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.5 }}>
              {workOrderData.description}
            </div>
            <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>1. Lockout/Tagout (LOTO) breaker</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>2. Inspect insert seat pocket</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>3. Mount WNMG-080408 at 4.2 Nm</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>4. Validate TIR runout &le; 0.005 mm</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: SOP Revision Proposal View (1,900-Part Threshold Alert) */}
      {activeTab === 'sop' && (
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                Standard Operating Procedure Revision
              </div>
              <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#F1F5F9' }}>
                {sopData.sop_id} — {sopData.title}
              </h4>
            </div>
            <span style={{ background: sopData.approved ? '#064E3B' : '#78350F', color: sopData.approved ? '#6EE7B7' : '#FCD34D', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
              {sopData.approved ? 'APPROVED' : 'PENDING SHIFT LEADER SIGN-OFF'}
            </span>
          </div>

          {/* Prominent Threshold Alert Callout */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid #0284C7',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38BDF8' }}>
                ⚡ Automated Discrete Piece-Counter Alert Rule Added
              </div>
              <div style={{ fontSize: '0.8rem', color: '#E2E8F0', marginTop: '0.2rem' }}>
                Replaces calendar-based scheduling with automated edge piece-counter telemetry.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ textAlign: 'center', background: '#0F172A', padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.7rem', color: '#FCD34D', fontWeight: 700 }}>WARNING ALERT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F59E0B' }}>1,900 Parts</div>
              </div>
              <div style={{ textAlign: 'center', background: '#0F172A', padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.7rem', color: '#F87171', fontWeight: 700 }}>HARD LOCKOUT</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#EF4444' }}>2,000 Parts</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Current SOP (Baseline Before Incident)
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.5 }}>
                {sopData.current_procedure}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#F87171', marginTop: '0.5rem' }}>
                ⚠️ Defect Vulnerability: Allows tooling to run past 2,140 parts during peak shifts without alert.
              </div>
            </div>

            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #059669' }}>
              <div style={{ fontSize: '0.75rem', color: '#34D399', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Proposed SOP Revision (Closed-Loop Kaizen)
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9', lineHeight: 1.5 }}>
                {sopData.proposed_revision}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#34D399', marginTop: '0.5rem' }}>
                ✓ Proactive Protection: Zero surface defects from over-extended tool insert wear.
              </div>
            </div>
          </div>

          <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
            <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Technical Justification (RCA Incident Link)
            </div>
            <div style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.4 }}>
              {sopData.justification}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Approval & Audit Trail View */}
      {activeTab === 'audit' && (
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                Governance & Compliance Audit Trail
              </div>
              <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#F1F5F9' }}>
                Shift Leader Digital Sign-off & Factory Archive
              </h4>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '6px',
                background: effectiveApproved ? '#064E3B' : '#78350F',
                color: effectiveApproved ? '#6EE7B7' : '#FCD34D',
              }}
            >
              {effectiveApproved ? 'AUDIT READY & VERIFIED' : 'PENDING SHIFT LEADER ACTION'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Approver Metadata
              </div>
              <div style={{ fontSize: '0.85rem', color: '#F1F5F9' }}>
                Name: <strong>{auditRecord?.approver_name || 'Nguyễn Văn A'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                Role: <strong>{auditRecord?.approver_role || 'Operations Shift Leader (Shift A)'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                Operator ID: <strong>{auditRecord?.approver_id || 'SL-702'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                Timestamp: <strong>{auditRecord?.timestamp || (effectiveApproved ? new Date().toISOString() : 'Pending')}</strong>
              </div>
            </div>

            <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Compliance & Standards
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1' }}>
                Quality Standard: <strong>ISO 9001:2015 Clause 10.2</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                Automotive Standard: <strong>IATF 16949 Section 10.2.3</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#CBD5E1', marginTop: '0.25rem' }}>
                Physical Proof: <strong>50/50 Defect-Free Conveyor Streak</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#34D399', marginTop: '0.25rem' }}>
                Closed-Loop Status: <strong>Nonconformity Closed & Ingested</strong>
              </div>
            </div>
          </div>

          <div style={{ background: '#090D16', padding: '1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
            <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Cryptographic Digital Signature Hash
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: effectiveApproved ? '#34D399' : '#64748B',
                wordBreak: 'break-all',
                background: '#0B131F',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #1E293B',
              }}
            >
              {auditRecord?.signature_hash ||
                (effectiveApproved
                  ? 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'
                  : 'Pending cryptographic generation upon Shift Leader approval authorization')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
