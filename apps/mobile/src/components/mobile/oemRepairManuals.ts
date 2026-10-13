/**
 * Copy of `OEM_REPAIR_MANUALS` checkpoints in backend/agents/agent_technician_copilot.py.
 * No endpoint exposes them yet, so keep this in sync by hand until one does.
 */
import type { RepairCheckpoint } from '../../types';
import type { RepairStep } from '../../types/mobile';

interface OemManual {
  manualTitle: string;
  primaryCitation: string;
  /** Parts and tools named in the checkpoint instructions. */
  parts: string[];
  checkpoints: RepairCheckpoint[];
}

export const OEM_REPAIR_MANUALS: Record<string, OemManual> = {
  'CNC-02': {
    manualTitle: 'Sổ tay hướng dẫn vận hành & bảo trì CNC-02 (OEM Manual 2024)',
    primaryCitation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2',
    parts: [
      'Mảnh cắt insert WNMG-080408 (×1)',
      'Cờ lê lực (4.2 N·m)',
      'Khóa lục giác',
      'Đồng hồ so',
      'Biển cảnh báo LOTO',
    ],
    checkpoints: [
      {
        step_number: 1,
        title_vi: 'Khóa an toàn LOTO & ngắt nguồn',
        instruction_vi:
          'Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.1, nhấn nút dừng khẩn cấp E-Stop, ngắt cầu dao nguồn chính và treo biển cảnh báo LOTO trước khi can thiệp vào khoang máy.',
        citation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.1',
      },
      {
        step_number: 2,
        title_vi: 'Mở nắp chắn an toàn & kiểm tra mảnh cắt insert T07',
        instruction_vi:
          'Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.2, mở nắp chắn bảo vệ bên trái khoang gia công, dùng đèn kiểm tra mảnh cắt insert T07. Quan sát dấu hiệu mòn mặt sau (flank wear) hoặc mẻ lưỡi cắt.',
        citation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.2',
      },
      {
        step_number: 3,
        title_vi: 'Tháo insert cũ & lắp mảnh cắt mới chuẩn lực siết',
        instruction_vi:
          'Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.3, dùng khóa lục giác nới vít kẹp, tháo insert T07 đã mòn. Vệ sinh sạch hốc gá dao, lắp mảnh cắt mới mã WNMG-080408 và siết với lực siết định mức 4.2 N·m bằng cờ lê lực.',
        citation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.3',
      },
      {
        step_number: 4,
        title_vi: 'Đo độ đảo trục chính / đầu dao bằng đồng hồ so',
        instruction_vi:
          'Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.4, gá đồng hồ so lên bàn máy, rà đầu kim vào mặt chuẩn của đầu dao/trục chính. Quay nhẹ trục chính bằng tay 360 độ. Độ đảo trục chính (spindle runout) bắt buộc phải nhỏ hơn hoặc bằng dung sai tối đa 0.005 mm.',
        citation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.4',
        metric_name: 'Độ đảo trục chính (spindle runout)',
        target_threshold: 0.005,
        comparator: '<=',
        unit: 'mm',
      },
      {
        step_number: 5,
        title_vi: 'Đóng nắp chắn an toàn & chạy thử không tải',
        instruction_vi:
          'Theo sổ tay hướng dẫn máy CNC-02 trang 112 mục 4.2.5, thu dọn dụng cụ, đóng nắp chắn bảo vệ, mở khóa E-Stop, reset cảnh báo trên màn hình CNC và chạy thử trục chính không tải ở 1,500 RPM trong 60 giây.',
        citation: 'Sổ tay hướng dẫn CNC-02 trang 112, mục 4.2.5',
      },
    ],
  },
  'IM-05': {
    manualTitle: 'Sổ tay bảo trì máy ép phun nhựa IM-05 & Hệ thống sấy ABS (OEM Manual 2024)',
    primaryCitation: 'SOP-MOLD-02 trang 45, mục 3',
    parts: [
      'Lõi lọc tách ẩm FLT-ABS-04 (×1)',
      'Gioăng O-ring chịu nhiệt (×1)',
      'Đầu đo điểm sương (dew point sensor)',
    ],
    checkpoints: [
      {
        step_number: 1,
        title_vi: 'Khóa nhiệt & cô lập áp khí nén phễu sấy',
        instruction_vi:
          'Theo tài liệu SOP-MOLD-02 trang 45 mục 3.1, ngắt điện trở sấy nhiệt, khóa van cấp khí nén vào phễu sấy và xả hết áp dư trên van an toàn.',
        citation: 'SOP-MOLD-02 trang 45, mục 3.1',
      },
      {
        step_number: 2,
        title_vi: 'Tháo bộ lọc máy sấy cũ bị nghẹt dầu',
        instruction_vi:
          'Theo tài liệu SOP-MOLD-02 trang 45 mục 3.2, mở khóa ngàm tháo cốc lọc, lấy lõi lọc cũ đã nghẹt dầu và vệ sinh sạch khoang chứa cốc lọc.',
        citation: 'SOP-MOLD-02 trang 45, mục 3.2',
      },
      {
        step_number: 3,
        title_vi: 'Lắp lõi lọc tách ẩm mới mã FLT-ABS-04',
        instruction_vi:
          'Theo tài liệu SOP-MOLD-02 trang 45 mục 3.3, lắp lõi lọc mới FLT-ABS-04, thay vòng đệm gioăng cao su chịu nhiệt O-ring và siết chặt cốc lọc.',
        citation: 'SOP-MOLD-02 trang 45, mục 3.3',
      },
      {
        step_number: 4,
        title_vi: 'Đo kiểm tra điểm sương luồng khí sấy',
        instruction_vi:
          'Theo tài liệu SOP-MOLD-02 trang 46 mục 3.4, bật trạm khí khô, gắn đầu đo điểm sương (dew point sensor). Điểm sương phải đạt dưới mức tiêu chuẩn -30.0 °C trước khi đưa vật liệu vào.',
        citation: 'SOP-MOLD-02 trang 46, mục 3.4',
        metric_name: 'Điểm sương khí sấy',
        target_threshold: -30.0,
        comparator: '<=',
        unit: '°C',
      },
      {
        step_number: 5,
        title_vi: 'Bật gia nhiệt & duy trì sấy hạt nhựa ABS trong 4 giờ',
        instruction_vi:
          'Theo tài liệu SOP-MOLD-02 trang 46 mục 3.5, cài đặt nhiệt độ sấy 85 °C và duy trì sấy lại hạt nhựa ABS trong tối thiểu 4 giờ trước khi mở van cấp liệu xuống cụm ép phun cavity 3.',
        citation: 'SOP-MOLD-02 trang 46, mục 3.5',
      },
    ],
  },
};

const COMPARATOR_SYMBOL: Record<string, string> = { '<=': '≤', '>=': '≥', '<': '<', '>': '>' };

/** Maps a backend checkpoint onto the app's step card. */
export function checkpointToStep(cp: RepairCheckpoint): RepairStep {
  const hasMetric = cp.target_threshold !== null && cp.target_threshold !== undefined;
  const symbol = COMPARATOR_SYMBOL[cp.comparator ?? '<='] ?? cp.comparator ?? '';
  return {
    id: cp.step_number,
    title: cp.title_vi,
    instruction: cp.instruction_vi,
    instructionVi: cp.instruction_vi,
    target: hasMetric ? `${symbol} ${cp.target_threshold} ${cp.unit ?? ''}`.trim() : 'Hoàn thành',
    tolerance: cp.metric_name ?? 'Xác nhận bằng mắt',
    reference: cp.citation,
  };
}

function findManual(machine?: string | null): OemManual | undefined {
  if (!machine) return undefined;
  const key = Object.keys(OEM_REPAIR_MANUALS).find((k) => machine.toUpperCase().includes(k));
  return key ? OEM_REPAIR_MANUALS[key] : undefined;
}

export function getRepairSteps(machine?: string | null): RepairStep[] {
  return findManual(machine)?.checkpoints.map(checkpointToStep) ?? [];
}

export function getRepairParts(machine?: string | null): string[] {
  return findManual(machine)?.parts ?? [];
}
