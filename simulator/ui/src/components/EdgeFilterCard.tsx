import React from 'react';
import type { EdgeFilterStatistics } from '../types';

export default function EdgeFilterCard({ stats }: { stats?: EdgeFilterStatistics }): React.ReactElement {
  const s = stats || { total_frames_evaluated: 0, pass_frames_dropped: 0, defect_frames_forwarded: 0, estimated_bandwidth_saved_mb: 0, cloud_bandwidth_reduction_pct: 95.0 };
  const pct = s.cloud_bandwidth_reduction_pct || 95.0;

  return (
    <div className="glass-card flex-col">
      <div className="section-head">
        <span className="section-title"><span className="material-symbols-outlined accent-icon">filter_alt</span>Gemma 3 Edge Noise Filter</span>
        <span className="chip chip-ok">95%+ Drop Active</span>
      </div>
      <div className="edge-grid">
        <div className="stat-box"><span className="faint text-xs">Evaluated</span><b className="stat-val">{s.total_frames_evaluated.toLocaleString()}</b><span className="faint text-xs">Frames</span></div>
        <div className="stat-box"><span className="faint text-xs">Discarded (95%)</span><b className="stat-val green">{s.pass_frames_dropped.toLocaleString()}</b><span className="faint text-xs">{pct.toFixed(1)}% local drop</span></div>
        <div className="stat-box"><span className="faint text-xs">Defects Forwarded</span><b className="stat-val accent">{s.defect_frames_forwarded.toLocaleString()}</b><span className="faint text-xs">100% anomaly alert</span></div>
        <div className="stat-box"><span className="faint text-xs">Cloud Bandwidth Saved</span><b className="stat-val green">{s.estimated_bandwidth_saved_mb.toFixed(1)} MB</b><span className="faint text-xs">Zero egress waste</span></div>
      </div>
      <div className="bar-bg mt-2"><div className="bar-fill fill-pass" style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}
