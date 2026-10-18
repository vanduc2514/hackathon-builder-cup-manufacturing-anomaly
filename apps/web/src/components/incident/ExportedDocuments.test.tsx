import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExportedDocuments from './ExportedDocuments';
import { useApi } from '../../lib/api';
import type { ApiResource } from '../../lib/api';
import type { IncidentDocumentsResponse, IncidentState } from '../../types';

vi.mock('../../lib/api', () => ({
  useApi: vi.fn(),
}));

const useApiMock = vi.mocked(useApi);

afterEach(() => cleanup());

const incident: IncidentState = {
  incident_id: 'INC-0412',
  status: 'closed',
  status_reason: null,
  defect_type: 'scratch_vertical',
  defect_rate: 0.077,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'T07 flank wear',
  verification_count: 50,
  verification_target: 50,
  approved: true,
  findings: [],
  impact: null,
  documents: {},
  updated_at: '08:00:00',
};

function mockApi(data: IncidentDocumentsResponse | null, error: string | null = null) {
  useApiMock.mockReturnValue({ data, error, loading: false, reload: () => {} } as ApiResource<IncidentDocumentsResponse>);
}

const gcsResponse: IncidentDocumentsResponse = {
  incident_id: 'INC-0412',
  exported: true,
  export_error: null,
  destination: 'gcs',
  bucket: 'kaizen-lab-kb',
  console_url: 'https://console.cloud.google.com/storage/browser/kaizen-lab-kb/incidents/INC-0412',
  documents: [
    { name: 'work_order.md', title: 'Work Order', uri: 'gs://kaizen-lab-kb/incidents/INC-0412/work_order.md' },
    { name: 'report_8d.md', title: '8D Report', uri: 'gs://kaizen-lab-kb/incidents/INC-0412/report_8d.md' },
    { name: 'sop_proposal.md', title: 'SOP Proposal', uri: 'gs://kaizen-lab-kb/incidents/INC-0412/sop_proposal.md' },
    { name: 'impact_card.md', title: 'Impact Card', uri: 'gs://kaizen-lab-kb/incidents/INC-0412/impact_card.md' },
  ],
};

describe('ExportedDocuments (#333)', () => {
  beforeEach(() => {
    useApiMock.mockClear();
  });

  it('renders nothing before the incident is approved', () => {
    mockApi(null);
    const { container } = render(<ExportedDocuments incident={{ ...incident, approved: false }} />);
    expect(container.querySelector('#documents-export')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows the 4 document links to the Cloud Console (new tab) after approval', () => {
    mockApi(gcsResponse);
    const { container } = render(<ExportedDocuments incident={incident} />);
    expect(container.querySelector('#documents-export')).not.toBeNull();

    // The 4 exported documents with their gs:// URIs.
    for (const doc of gcsResponse.documents) {
      expect(screen.getByText(doc.title)).not.toBeNull();
      expect(screen.getByText(doc.uri)).not.toBeNull();
    }
    // Every link opens the (private) GCS folder via the Console URL in a new tab.
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).filter(
      (a) => a.href === gcsResponse.console_url,
    );
    expect(links).toHaveLength(5);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noreferrer');
    }
  });

  it('shows local paths with no console link in dev mode', () => {
    mockApi({
      incident_id: 'INC-0412',
      exported: true,
      export_error: null,
      destination: 'local',
      bucket: null,
      console_url: null,
      documents: [
        { name: 'work_order.md', title: 'Work Order', uri: 'artifacts/documents/INC-0412/work_order.md' },
        { name: 'report_8d.md', title: '8D Report', uri: 'artifacts/documents/INC-0412/report_8d.md' },
        { name: 'sop_proposal.md', title: 'SOP Proposal', uri: 'artifacts/documents/INC-0412/sop_proposal.md' },
        { name: 'impact_card.md', title: 'Impact Card', uri: 'artifacts/documents/INC-0412/impact_card.md' },
      ],
    });
    const { container } = render(<ExportedDocuments incident={incident} />);
    expect(screen.getByText(/local artifacts directory/)).not.toBeNull();
    expect(screen.getAllByText('local file')).toHaveLength(4);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows the pending state while the background export runs', () => {
    mockApi({
      incident_id: 'INC-0412',
      exported: false,
      export_error: null,
      destination: 'local',
      bucket: null,
      console_url: null,
      documents: [],
    });
    const { container } = render(<ExportedDocuments incident={incident} />);
    expect(container.querySelector('#documents-export-pending')).not.toBeNull();
    expect(screen.getByText(/Exporting the approved documents/)).not.toBeNull();
  });

  it('surfaces a failed export without breaking the approved state', () => {
    mockApi({
      incident_id: 'INC-0412',
      exported: false,
      export_error: 'gcs unreachable',
      destination: 'local',
      bucket: null,
      console_url: null,
      documents: [],
    });
    render(<ExportedDocuments incident={incident} />);
    expect(screen.getByText(/Document export failed: gcs unreachable/)).not.toBeNull();
    expect(screen.getByText(/approval itself succeeded/)).not.toBeNull();
  });
});
