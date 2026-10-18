import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ExportedDocuments from './ExportedDocuments';
import { fetchJson, useApi } from '../../lib/api';
import type { ApiResource } from '../../lib/api';
import type { IncidentDocumentsResponse, IncidentState } from '../../types';

vi.mock('../../lib/api', () => ({
  useApi: vi.fn(),
  fetchJson: vi.fn(),
}));

const useApiMock = vi.mocked(useApi);
const fetchJsonMock = vi.mocked(fetchJson);

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
  documents: [
    { name: 'work_order.md', title: 'Work Order', path: 'incidents/INC-0412/work_order.md' },
    { name: 'report_8d.md', title: '8D Report', path: 'incidents/INC-0412/report_8d.md' },
    { name: 'sop_proposal.md', title: 'SOP Proposal', path: 'incidents/INC-0412/sop_proposal.md' },
    { name: 'impact_card.md', title: 'Impact Card', path: 'incidents/INC-0412/impact_card.md' },
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

  it('shows relative paths with Download/Open and no Cloud Console links', () => {
    mockApi(gcsResponse);
    const { container } = render(<ExportedDocuments incident={incident} />);
    expect(container.querySelector('#documents-export')).not.toBeNull();
    for (const doc of gcsResponse.documents) {
      expect(screen.getByText(doc.title)).not.toBeNull();
      expect(screen.getByText(doc.path)).not.toBeNull();
    }
    expect(screen.getByText('incidents/INC-0412/work_order.md')).not.toBeNull();
    expect(container.textContent).not.toContain('gs://');
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^Download / })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(4);
  });

  it('opens a modal that renders the document Markdown', async () => {
    mockApi(gcsResponse);
    fetchJsonMock.mockResolvedValue({ name: 'work_order.md', title: 'Work Order', content: '# Work Order body\n\n- step one' });
    render(<ExportedDocuments incident={incident} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Work Order' }));
    await waitFor(() => expect(screen.getByRole('dialog')).not.toBeNull());
    expect(fetchJsonMock).toHaveBeenCalledWith('/api/incidents/documents/work_order.md');
    expect(screen.getByRole('heading', { level: 1, name: 'Work Order body' })).not.toBeNull();
  });

  it('shows paths with no links or local chip in dev mode', () => {
    mockApi({
      ...gcsResponse,
      destination: 'local',
      bucket: null,
    });
    const { container } = render(<ExportedDocuments incident={incident} />);
    expect(screen.getByText(/local artifacts directory/)).not.toBeNull();
    expect(screen.queryByText('local file')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows the pending state while the background export runs', () => {
    mockApi({
      incident_id: 'INC-0412',
      exported: false,
      export_error: null,
      destination: 'local',
      bucket: null,
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
      documents: [],
    });
    render(<ExportedDocuments incident={incident} />);
    expect(screen.getByText(/Document export failed: gcs unreachable/)).not.toBeNull();
    expect(screen.getByText(/approval itself succeeded/)).not.toBeNull();
  });
});
