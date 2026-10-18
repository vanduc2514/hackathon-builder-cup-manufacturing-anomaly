import math
import os

out_dir = '.stitch/previews/topology'
os.makedirs(out_dir, exist_ok=True)

STYLE = """<style>
:root, svg {
  --ink: #0b1220;
  --ink-2: #1e2638;
  --text: #334155;
  --muted: #64748b;
  --faint: #94a3b8;
  --hair: rgba(15, 23, 42, .07);
  --hair-strong: rgba(15, 23, 42, .14);
  --accent: #5b5bf0;
  --accent-2: #7c6cff;
  --accent-soft: rgba(91, 91, 240, .1);
  --accent-ring: rgba(91, 91, 240, .28);
  --danger: #e5484d;
  --danger-soft: rgba(229, 72, 77, .12);
  --warning: #f5a524;
  --warning-soft: rgba(245, 165, 36, .14);
  --success: #12a150;
  --success-soft: rgba(18, 161, 80, .12);
  --info: #3b82f6;
  --info-soft: rgba(59, 130, 246, .12);
  --font-main: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
@keyframes pvScan { 0% { transform: translateY(0); } 100% { transform: translateY(140px); } }
@keyframes pvPacket { 0% { transform: translateX(0); opacity: 0; } 10% { opacity: .9; } 90% { opacity: .9; } 100% { transform: translateX(200px); opacity: 0; } }
@keyframes pvPacketShort { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: .9; } 85% { opacity: .9; } 100% { transform: translateX(118px); opacity: 0; } }
@keyframes pvBlink { 50% { opacity: .25; } }
@keyframes pvBreathe { 50% { opacity: .55; } }
@keyframes pvFlow { to { stroke-dashoffset: -20; } }
.pv-scan { animation: pvScan 3.2s ease-in-out infinite alternate; }
.pv-packet { animation: pvPacket 4.4s linear infinite; }
.pv-packet-short { animation-name: pvPacketShort; animation-duration: 3.6s; }
.pv-blink { animation: pvBlink 2s ease-in-out infinite; }
.pv-breathe { animation: pvBreathe 2.8s ease-in-out infinite; }
.pv-flow { animation: pvFlow 1.6s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .pv-scan, .pv-packet, .pv-blink, .pv-breathe, .pv-flow { animation: none; }
  .pv-packet { opacity: .9; }
}
</style>"""

PV_DEFS = STYLE + '<defs><marker id="pv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#334155"/></marker></defs>'

def svg_text(x, y, t, size=11, fill='var(--muted)', anchor=None, weight=None, mono=False):
    anc = f' text-anchor="{anchor}"' if anchor else ''
    w = f' font-weight="{weight}"' if weight else ''
    font = 'var(--font-mono)' if mono else 'var(--font-main)'
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}"{anc}{w} font-family="{font}">{t}</text>'

def svg_box(x, y, w, h, rx=8, fill='#fff', stroke='var(--hair-strong)', sw=1, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>'

def svg_arrow(d, stroke='#334155', sw=1.6, dash=None, cls=None):
    ds = f' stroke-dasharray="{dash}"' if dash else ''
    c = f' class="{cls}"' if cls else ''
    return f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{sw}" marker-end="url(#pv-arrow)"{ds}{c}/>'

def pv_svg(h, label, body, vb_w=520):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w} {h}" role="img" aria-label="{label}">{PV_DEFS}{body}</svg>'

# 1. Camera Viewfinder
def build_camera():
    corners = ''.join([
        f'<path d="M{x} {y + dy * 22} L{x} {y} L{x + dx * 22} {y}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/>'
        for x, y, dx, dy in [[16, 14, 1, 1], [504, 14, -1, 1], [16, 166, 1, -1], [504, 166, -1, -1]]
    ])
    body = f'''
      {svg_box(8, 6, 504, 168, rx=12, fill='#f6f8fd')}
      <rect x="8" y="128" width="504" height="18" fill="rgba(15,23,42,.05)"/>
      <path d="M150 128 L180 62 L340 62 L370 128 Z" fill="#dfe4f0" stroke="#94a3b8" stroke-width="1.4"/>
      <path d="M180 62 L196 50 L324 50 L340 62 Z" fill="#eef1f8" stroke="#94a3b8" stroke-width="1.2"/>
      <path d="M268 74 l8 10 l-5 4 l9 12" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"/>
      <rect x="252" y="66" width="44" height="44" rx="4" fill="rgba(229,72,77,.08)" stroke="var(--danger)" stroke-width="1.8" stroke-dasharray="5 3"/>
      <rect x="296" y="66" width="146" height="20" rx="6" fill="var(--danger)"/>
      {svg_text(304, 80, 'surface_tear · 0.96', size=11, fill='#fff', mono=True, weight=600)}
      <g class="pv-scan"><rect x="16" y="20" width="488" height="2" fill="var(--accent)" opacity=".75"/><rect x="16" y="2" width="488" height="18" fill="url(#pv-scan-grad)"/></g>
      <defs><linearGradient id="pv-scan-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".18"/></linearGradient></defs>
      {corners}
      <circle cx="34" cy="34" r="4.5" fill="var(--danger)" class="pv-blink"/>
      {svg_text(44, 38, 'CAM-EOL-01 · LIVE', size=11, fill='var(--ink)', mono=True, weight=600)}
      {svg_text(496, 38, 'WP-2026-90412', size=11, fill='var(--muted)', mono=True, anchor='end')}
      <path d="M260 154 L280 154 M270 149 L270 159" stroke="var(--faint)" stroke-width="1.2"/>
      {svg_text(34, 160, '→ conveyor 0.45 m/s', size=10.5, mono=True)}'''
    return pv_svg(180, 'Camera viewfinder: part on conveyor, defect bounding box, scan line', body)

# 2. Pub/Sub Topic
def build_pubsub():
    packets = ''.join([
        f'<rect class="pv-packet" style="animation-delay:{-i * 1.1}s" x="150" y="80" width="22" height="14" rx="4" fill="{"var(--danger)" if i == 1 else "var(--accent)"}" opacity=".9"/>'
        for i in range(4)
    ])
    body = f'''
      {svg_box(10, 30, 118, 40, fill='#fff')}{svg_text(69, 55, 'Edge Bridge', anchor='middle', fill='var(--ink)', weight=600)}
      {svg_box(10, 104, 118, 40, fill='#fff')}{svg_text(69, 129, 'Gemma Edge', anchor='middle', fill='var(--ink)', weight=600)}
      {svg_arrow('M128 50 C140 50 136 87 148 87')}{svg_arrow('M128 124 C140 124 136 87 148 87')}
      <rect x="148" y="72" width="226" height="30" rx="15" fill="var(--accent-soft)" stroke="var(--accent-ring)"/>
      {packets}
      {svg_text(261, 122, 'topic · factory-events', anchor='middle', mono=True, size=11, fill='var(--ink)')}
      {svg_text(261, 62, 'ordered · at-least-once', anchor='middle', size=10.5)}
      {svg_arrow('M374 87 C388 87 384 50 400 50')}{svg_arrow('M374 87 C388 87 384 124 400 124')}
      {svg_box(400, 30, 110, 40)}{svg_text(455, 55, 'BigQuery', anchor='middle', fill='var(--ink)', weight=600)}
      {svg_box(400, 104, 110, 40)}{svg_text(455, 129, 'Orchestrator', anchor='middle', fill='var(--ink)', weight=600)}
      {svg_text(455, 162, 'subscriptions', anchor='middle', size=10.5)}{svg_text(69, 162, 'publishers', anchor='middle', size=10.5)}'''
    return pv_svg(176, 'Pub/Sub topic: messages flow from publishers through topic to subscribers', body)

# 3. BigQuery partitioned
def build_bigquery():
    cols = [['ts', 12], ['serial', 96], ['lot_id', 196], ['vib_rms', 324], ['spc', 400]]
    rows = [
      ['10:39:58', 'WP-90409', 'LOT-B41-0937', '1.52', 'ok'],
      ['10:39:59', 'WP-90410', 'LOT-B41-0937', '1.61', 'ok'],
      ['10:40:00', 'WP-90412', 'LOT-B42-0941', '2.84', 'UCL'],
      ['10:40:01', 'WP-90413', 'LOT-B42-0941', '2.79', 'UCL'],
      ['10:40:02', 'WP-90414', 'LOT-B42-0941', '2.91', 'UCL']
    ]
    head = ''.join([svg_text(60 + x, 46, c, mono=True, size=10.5, weight=700, fill='var(--ink)') for c, x in cols])
    body_rows = ''
    for i, r in enumerate(rows):
        y = 56 + i * 22
        hot = (i >= 2)
        bg = 'var(--accent-soft)' if hot else ('#fff' if i % 2 else '#f8fafd')
        body_rows += f'<rect x="60" y="{y}" width="452" height="22" fill="{bg}"/>'
        for j, v in enumerate(r):
            f_color = 'var(--danger)' if (j == 4 and hot) else ('var(--ink)' if hot else 'var(--text)')
            w_val = 700 if (hot and j == 2) else None
            body_rows += svg_text(60 + cols[j][1], y + 15, v, mono=True, size=10.5, fill=f_color, weight=w_val)
    body = f'''
      {svg_text(8, 18, 'kaizen_mfg.sensor_telemetry_100hz', mono=True, size=11, fill='var(--ink)', weight=600)}
      {svg_text(512, 18, 'PARTITION BY DATE(ts)', mono=True, size=10.5, anchor='end')}
      {svg_box(60, 30, 452, 136, rx=6, fill='#fff')}
      <rect x="60" y="30" width="452" height="26" rx="6" fill="#eef1f8"/>{head}{body_rows}
      <path d="M50 56 L44 56 L44 100 L50 100" fill="none" stroke="var(--faint)" stroke-width="1.4"/>
      <path d="M50 102 L44 102 L44 166 L50 166" fill="none" stroke="var(--accent)" stroke-width="1.8"/>
      {svg_text(38, 82, '10-15', mono=True, size=9.5, anchor='end')}{svg_text(38, 138, '10-16', mono=True, size=9.5, anchor='end', fill='var(--accent)', weight=700)}
      {svg_text(286, 182, 'suspect lot LOT-B42-0941 isolated · 124k rows scanned', anchor='middle', size=10.5)}'''
    return pv_svg(186, 'BigQuery partitioned table with suspect lot rows highlighted', body)

# 4. Firestore Blackboard
def build_firestore():
    agents = ['QA', 'TRA', 'PA', 'RCA']
    agent_boxes = ''.join([
        f'{svg_box(400, 14 + i * 38, 104, 30, fill="#fff")}{svg_text(452, 34 + i * 38, a, anchor="middle", fill="var(--ink)", weight=600)}{svg_arrow("M400 " + str(29 + i * 38) + " C320 " + str(29 + i * 38) + " 280 77 200 77", dash="4 4", cls="pv-flow")}'
        for i, a in enumerate(agents)
    ])
    body = f'''
      {svg_box(10, 14, 120, 34, fill='#eef1f8')}{svg_text(70, 36, 'incidents/', anchor='middle', mono=True, fill='var(--ink)', weight=600)}
      <path d="M30 48 L30 76 L46 76" fill="none" stroke="var(--faint)" stroke-width="1.4"/>
      {svg_box(46, 60, 150, 34, fill='#fff', stroke='var(--accent)', sw=1.6)}{svg_text(121, 82, 'INC-2026-B42', anchor='middle', mono=True, fill='var(--ink)', weight=700)}
      <path d="M64 94 L64 160 M64 116 L80 116 M64 138 L80 138 M64 160 L80 160" fill="none" stroke="var(--faint)" stroke-width="1.4"/>
      {svg_text(86, 120, 'state: investigating', mono=True, size=10.5, fill='var(--accent)', weight=700)}
      {svg_text(86, 142, 'findings[ ]: 4 drafts', mono=True, size=10.5, fill='var(--text)')}
      {svg_text(86, 164, 'version: 4', mono=True, size=10.5, fill='var(--text)')}
      {agent_boxes}
      {svg_text(300, 170, 'workflow nodes write · SSE pushes to UI', anchor='middle', size=10.5)}'''
    return pv_svg(176, 'Firestore blackboard document tree with reactive multi-agent writes', body)

# 5. Vertex RAG Search
def build_rag():
    docs = [['SOP-CNC-TOOL-CALIB-v4', 0.94], ['8D-2025-T07-wear', 0.81], ['MAINT-LOG-CNC02', 0.66]]
    doc_cards = ''
    for i, (d, s) in enumerate(docs):
        x = 8 + i * 170
        top = (i == 0)
        c_stroke = 'var(--accent)' if top else 'var(--hair-strong)'
        sw = 1.8 if top else 1
        icon_bg = 'var(--accent-soft)' if top else '#f1f4fa'
        icon_s = 'var(--accent)' if top else 'var(--faint)'
        fill_score = 'var(--accent)' if top else 'var(--hair-strong)'
        val_c = 'var(--accent)' if top else 'var(--muted)'
        w_bar = 60 if top else 40
        c_bar = 'var(--warning)' if top else 'rgba(15,23,42,.07)'
        doc_cards += f'''
          {svg_box(x, 60, 160, 92, fill='#fff', stroke=c_stroke, sw=sw)}
          <path d="M{x + 14} 74 h22 v28 h-22 z" fill="{icon_bg}" stroke="{icon_s}"/>
          <rect x="{x + 44}" y="76" width="100" height="4" rx="2" fill="rgba(15,23,42,.1)"/>
          <rect x="{x + 44}" y="86" width="74" height="4" rx="2" fill="rgba(15,23,42,.07)"/>
          <rect x="{x + 44}" y="96" width="{w_bar}" height="4" rx="2" fill="{c_bar}"/>
          {svg_text(x + 14, 122, d, mono=True, size=9.5, fill='var(--ink)', weight=(700 if top else None))}
          <rect x="{x + 14}" y="132" width="100" height="8" rx="4" fill="rgba(15,23,42,.06)"/>
          <rect x="{x + 14}" y="132" width="{100 * s}" height="8" rx="4" fill="{fill_score}"/>
          {svg_text(x + 146, 140, f"{s:.2f}", mono=True, size=10.5, anchor='end', fill=val_c, weight=700)}'''
    body = f'''
      {svg_box(8, 10, 504, 34, rx=17, fill='#fff')}
      <circle cx="30" cy="27" r="7" fill="none" stroke="var(--muted)" stroke-width="1.8"/><path d="M35 32 L40 37" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round"/>
      {svg_text(48, 31, '"spindle vibration + flank wear on T07"', mono=True, size=11, fill='var(--ink)')}
      {doc_cards}
      {svg_text(8, 170, 'top-3 citations handed to Root Cause agent', size=10.5)}'''
    return pv_svg(176, 'RAG search query with SOP citations ranked by similarity', body)

# 6. Gemini Multimodal
def build_gemini():
    ins = ['Photo', 'Voice', 'Telemetry']
    in_boxes = ''.join([
        f'{svg_box(8, 14 + i * 50, 112, 38, fill="#fff")}{svg_text(64, 38 + i * 50, t, anchor="middle", fill="var(--ink)", weight=600)}{svg_arrow("M120 " + str(33 + i * 50) + " C160 " + str(33 + i * 50) + " 160 83 196 83")}'
        for i, t in enumerate(ins)
    ])
    body = f'''
      {in_boxes}
      <circle cx="240" cy="83" r="42" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.6"/>
      <path d="M240 58 C243 76 247 80 265 83 C247 86 243 90 240 108 C237 90 233 86 215 83 C233 80 237 76 240 58 Z" fill="var(--accent)" class="pv-breathe"/>
      {svg_arrow('M282 83 L318 83')}
      {svg_box(320, 22, 192, 124, fill='#f8fafd')}
      {svg_text(334, 44, '{', mono=True, fill='var(--ink)')}
      {svg_text(346, 64, '"root_cause": "T07 wear",', mono=True, size=10.5, fill='var(--text)')}
      {svg_text(346, 84, '"confidence": 0.89,', mono=True, size=10.5, fill='var(--accent)', weight=700)}
      {svg_text(346, 104, '"next": "replace insert"', mono=True, size=10.5, fill='var(--text)')}
      {svg_text(334, 124, '}', mono=True, fill='var(--ink)')}
      {svg_text(240, 148, 'multimodal reasoning', anchor='middle', size=10.5)}'''
    return pv_svg(170, 'Gemini multimodal reasoning returning structured JSON', body)

# 7. ADK Orchestrator Hub
def build_orchestrator():
    phases = [
      ['A', 'Detection', 'QA agent · SPC alarm', '229,72,77', 14, 14, 'danger', 'alarm'],
      ['B', 'Tracing & RCA', 'TRA · PA · RCA', '245,165,36', 348, 14, 'warning', 'in progress'],
      ['C', 'Resolution', 'Copilot · technician', '59,130,246', 348, 150, 'active', 'ready'],
      ['D', 'Learning & Verify', 'Streak · 8D · learn', '18,161,80', 14, 150, 'completed', 'waiting']
    ]
    tone = {
      'completed': ('var(--success)', '#0e8a43'),
      'active': ('var(--accent)', 'var(--accent)'),
      'warning': ('var(--warning)', '#b4710a'),
      'danger': ('var(--danger)', '#c9343a')
    }
    spokes = ''
    for phase_code, name, sub, rgb, x, y, kind, label in phases:
        line, txt = tone[kind]
        ex = x + 158 if x < 200 else x
        ey = y + 32
        p_start_x = 214 if x < 200 else 306
        p_start_y = 92 if y < 100 else 138
        p_ctrl_x = 196 if x < 200 else 324
        p_mid_x = ex + 22 if x < 200 else ex - 22
        path_d = f"M{p_start_x} {p_start_y} C{p_ctrl_x} {p_start_y} {p_mid_x} {ey} {ex} {ey}"
        spokes += f'''
          {svg_arrow(path_d, stroke=line, sw=2.4, dash='6 4', cls='pv-flow')}
          <rect x="{x}" y="{y}" width="158" height="64" rx="12" fill="rgba({rgb},.07)" stroke="rgba({rgb},.7)" stroke-width="1.4" stroke-dasharray="6 4"/>
          <circle cx="{x + 20}" cy="{y + 20}" r="11" fill="rgba({rgb},1)"/>
          {svg_text(x + 20, y + 24, phase_code, anchor='middle', fill='#fff', weight=700, size=12)}
          {svg_text(x + 38, y + 24, name, fill='var(--ink)', weight=650, size=11)}
          {svg_text(x + 12, y + 42, sub, size=10)}
          {svg_text(x + 12, y + 57, f"● {label}", size=10.5, fill=txt, weight=700, mono=True)}'''
    body = f'''
      {spokes}
      <rect x="196" y="78" width="128" height="74" rx="16" fill="#fff" stroke="var(--accent)" stroke-width="1.8"/>
      <rect x="196" y="78" width="128" height="74" rx="16" fill="var(--accent-soft)"/>
      {svg_text(260, 104, 'ADK', anchor='middle', fill="var(--accent)", weight=700, size=11, mono=True)}
      {svg_text(260, 122, 'Orchestrator', anchor='middle', fill="var(--ink)", weight=700, size=13)}
      {svg_text(260, 140, 'single-flight', anchor='middle', size=10)}
      {svg_text(260, 238, 'routes by Blackboard state · agents never call each other', anchor='middle', size=10.5)}'''
    return pv_svg(244, 'ADK Orchestrator routes the incident through phases A, B, C and D', body)

# 8. Machine Gauge
def build_machine():
    cx, cy, r = 70, 82, 46
    return pv_svg(150, 'CNC-02 spindle speed gauge and running cycle', f'''
      <path d="M{cx - r} {cy} A{r} {r} 0 0 1 {cx + r} {cy}" fill="none" stroke="rgba(15,23,42,.08)" stroke-width="10" stroke-linecap="round"/>
      <path d="M{cx - r} {cy} A{r} {r} 0 0 1 {cx + 34} {cy - 30}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"/>
      {svg_text(cx, cy - 4, '3200', anchor='middle', mono=True, weight=700, size=16, fill='var(--ink)')}
      {svg_text(cx, cy + 14, 'RPM', anchor='middle', size=10.5)}
      {svg_box(160, 18, 200, 112, rx=12, fill='#f6f8fd')}
      <rect x="244" y="26" width="32" height="40" rx="4" fill="#dfe4f0" stroke="#94a3b8"/><rect x="254" y="66" width="12" height="22" fill="#94a3b8"/>
      <path d="M260 88 l-6 10 h12 z" fill="var(--accent)" class="pv-breathe"/>
      <rect x="196" y="100" width="128" height="16" rx="3" fill="#cbd3e3"/>
      {svg_text(260, 145, 'CNC-02 · spindle 1 · cutting', anchor='middle', size=10.5)}
      {svg_text(380, 44, 'Cycle', size=10.5)}
      <rect x="380" y="52" width="130" height="10" rx="5" fill="rgba(15,23,42,.06)"/><rect x="380" y="52" width="88" height="10" rx="5" fill="var(--success)"/>
      {svg_text(380, 86, 'Coolant', size=10.5)}
      <rect x="380" y="94" width="130" height="10" rx="5" fill="rgba(15,23,42,.06)"/><rect x="380" y="94" width="104" height="10" rx="5" fill="var(--info)"/>''')

# 9. Spindle Vibration Waveform
def build_vibration():
    pts = ' '.join([
        f"{8 + i * 4.2:.1f},{(80 + math.sin(i * 0.9) * (10 if i < 70 else 10 + (i - 70) * 0.55) * math.cos(i * 0.13)):.1f}"
        for i in range(120)
    ])
    return pv_svg(160, 'Spindle vibration waveform growing above baseline band', f'''
      <rect x="8" y="66" width="504" height="28" fill="var(--success-soft)"/>
      {svg_text(12, 62, 'baseline 1.50 mm/s', mono=True, size=10.5, fill='#0e8a43')}
      <line x1="8" y1="44" x2="512" y2="44" stroke="var(--danger)" stroke-dasharray="4 4" stroke-width="1.2"/>
      {svg_text(512, 38, 'now 2.84 mm/s', mono=True, size=10.5, fill='var(--danger)', anchor='end', weight=700)}
      <polyline points="{pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
      {svg_text(8, 150, 'VIB-CNC02-SPINDLE · accelerometer · 100 Hz', size=10.5)}''')

# 10. QR Serial Tags
def build_tags():
    seed = 7
    cells = []
    for r in range(11):
        for c in range(11):
            seed = (seed * 9301 + 49297) % 233280
            finder = (r < 3 and c < 3) or (r < 3 and c > 7) or (r > 7 and c < 3)
            if finder or seed / 233280 > 0.55:
                cells.append(f'<rect x="{20 + c * 9}" y="{22 + r * 9}" width="9" height="9" fill="var(--ink)"/>')
    chain = [['Serial', 'WP-2026-90412'], ['Lot', 'LOT-B42-0941'], ['Heat', 'HEAT-8842']]
    chain_svg = ''.join([
        f'{svg_box(170 + i * 116, 52, 104, 44, fill="var(--accent-soft)" if i == 1 else "#fff", stroke="var(--accent)" if i == 1 else "var(--hair-strong)")}'
        f'{svg_text(222 + i * 116, 70, k, anchor="middle", size=10.5)}'
        f'{svg_text(222 + i * 116, 88, v, anchor="middle", mono=True, size=9.5, fill="var(--ink)", weight=700)}'
        f'{(svg_arrow("M" + str(158 + i * 116) + " 74 L" + str(168 + i * 116) + " 74") if i else "")}'
        for i, (k, v) in enumerate(chain)
    ])
    return pv_svg(150, 'Serial tag QR code linked to lot and heat number', f'''
      {svg_box(10, 12, 120, 120, fill='#fff')}{"".join(cells)}
      {chain_svg}
      {svg_arrow('M132 74 L168 74')}
      {svg_text(344, 124, 'scan at BAY-4-ENTRY → genealogy key', anchor='middle', size=10.5)}''')

# 11. Gemma Edge Filtering
def build_gemma():
    frame_list = []
    for i in range(10):
        opacity = 1 if i == 6 else 0.45
        bg = "#fff" if i == 6 else "#eef1f8"
        stroke = "var(--danger)" if i == 6 else "var(--hair-strong)"
        sw = 1.8 if i == 6 else 1
        box = svg_box(8 + i * 34, 26, 28, 36, fill=bg, stroke=stroke, sw=sw, rx=4)
        inner = '<rect x="218" y="34" width="12" height="12" fill="none" stroke="var(--danger)" stroke-dasharray="3 2"/>' if i == 6 else f'<path d="M{14 + i * 34} 56 L{30 + i * 34} 32" stroke="var(--faint)" stroke-width="1"/>'
        frame_list.append(f'<g opacity="{opacity}">{box}{inner}</g>')
    frames = ''.join(frame_list)
    return pv_svg(150, 'Gemma edge filter drops normal frames and forwards only defect frame', f'''
      {svg_text(8, 16, 'camera frames', size=10.5)}{frames}
      {svg_arrow('M182 64 C182 100 190 108 214 108', stroke='var(--faint)')}
      {svg_box(214, 92, 112, 32, fill='var(--success-soft)', stroke='rgba(18,161,80,.4)')}{svg_text(270, 112, 'dropped · 96.2%', anchor='middle', mono=True, size=10.5, fill='#0e8a43', weight=700)}
      {svg_arrow('M226 62 C236 84 360 84 384 52')}
      {svg_box(386, 26, 126, 36, fill='#fff', stroke='var(--danger)', sw=1.6)}{svg_text(449, 48, 'defect → cloud', anchor='middle', fill='var(--ink)', weight=650)}
      {svg_arrow('M449 62 L449 92')}
      {svg_box(386, 94, 126, 32, fill='#fff')}{svg_text(449, 114, 'diverter 38 ms', anchor='middle', mono=True, size=10.5, fill='var(--ink)')}
      {svg_text(8, 144, 'on-prem inference · no raw video leaves the plant', size=10.5)}''')

# 12. Edge Bridge OPC-UA -> MQTT
def build_bridge():
    packets = ''.join([f'<rect class="pv-packet pv-packet-short" style="animation-delay:{-i * 1.2}s" x="196" y="64" width="18" height="12" rx="3" fill="var(--accent)"/>' for i in range(3)])
    return pv_svg(140, 'Edge bridge converts OPC-UA machine data into MQTT messages', f'''
      {svg_box(8, 46, 140, 48, fill='#f6f8fd')}{svg_text(78, 66, 'OPC-UA', anchor='middle', fill='var(--ink)', weight=700)}{svg_text(78, 82, 'binary · PLC tags', anchor='middle', size=10)}
      {svg_arrow('M148 70 L188 70')}
      <rect x="190" y="52" width="140" height="36" rx="18" fill="var(--accent-soft)" stroke="var(--accent-ring)"/>{packets}
      {svg_text(260, 108, 'GW-BAY4 · normalise + buffer', anchor='middle', size=10.5)}
      {svg_arrow('M330 70 L370 70')}
      {svg_box(372, 46, 140, 48, fill='#fff')}{svg_text(442, 66, 'MQTT', anchor='middle', fill='var(--ink)', weight=700)}{svg_text(442, 82, 'JSON → Pub/Sub', anchor='middle', size=10)}''')

# 13. SPC Defect Rate Chart
def build_spc():
    vals = [1.8, 2.1, 1.6, 2.3, 1.9, 2.4, 2.0, 2.6, 2.2, 2.8, 3.4, 4.42]
    def y(v):
        return 130 - v * 22
    pts = ' '.join([f"{30 + i * 40},{y(v):.1f}" for i, v in enumerate(vals)])
    circles = ''.join([
        f'<circle cx="{30 + i * 40}" cy="{y(v):.1f}" r="{5 if v > 3 else 3.5}" fill="{"var(--danger)" if v > 3 else "var(--accent)"}" stroke="#fff" stroke-width="1.5"/>'
        for i, v in enumerate(vals)
    ])
    return pv_svg(160, 'p-chart: defect rate crosses the 3% upper control limit', f'''
      <line x1="24" y1="{y(3)}" x2="512" y2="{y(3)}" stroke="var(--danger)" stroke-dasharray="4 4" stroke-width="1.2"/>
      {svg_text(512, y(3) - 6, 'UCL 3.00%', mono=True, size=10.5, fill='var(--danger)', anchor='end')}
      <line x1="24" y1="{y(2.1)}" x2="512" y2="{y(2.1)}" stroke="var(--faint)" stroke-dasharray="2 4" stroke-width="1"/>
      {svg_text(512, y(2.1) - 6, 'CL', mono=True, size=10, anchor='end')}
      <polyline points="{pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      {circles}
      {svg_text(458, y(4.42) - 2, '4.42%', mono=True, size=11, fill='var(--danger)', anchor='end', weight=700)}
      {svg_text(24, 154, 'defect rate per 50-part sample · surface_tear_bevel', size=10.5)}''')

# 14. Traceability Genealogy
def build_genealogy():
    chain = [['CNC-02', 'Spindle 1', 14], ['T07', 'Face mill', 140], ['LOT-B42', '0941', 266]]
    boxes = ''.join([
        f'{svg_box(x, 62, 108, 44, fill="var(--warning-soft)" if i < 2 else "#fff", stroke="var(--warning)" if i < 2 else "var(--hair-strong)", sw=1.6 if i < 2 else 1)}'
        f'{svg_text(x + 54, 82, a, anchor="middle", mono=True, weight=700, fill="var(--ink)")}'
        f'{svg_text(x + 54, 98, b, anchor="middle", size=10)}'
        f'{(svg_arrow("M" + str(x - 4) + " 84 L" + str(x - 14) + " 84") if i else "")}'
        for i, (a, b, x) in enumerate(chain)
    ])
    serials = ''.join([
        f'{svg_arrow("M440 " + str(24 + i * 38) + " C410 " + str(24 + i * 38) + " 400 84 378 84", stroke="var(--danger)" if i < 3 else "var(--faint)")}'
        f'{svg_box(440, 10 + i * 38, 72, 28, fill="#fff", stroke="var(--danger)" if i < 3 else "var(--hair-strong)")}'
        f'{svg_text(476, 28 + i * 38, "…904" + str(12 + i), anchor="middle", mono=True, size=10, fill="var(--danger)" if i < 3 else "var(--muted)")}'
        for i in range(4)
    ])
    return pv_svg(170, 'Genealogy trace from bad parts back to CNC-02 and tool T07', f'''
      {boxes}{serials}
      {svg_text(14, 160, 'bad parts → lot → tool → machine · suspect 0.94', size=10.5)}''')

# 15. Diagnostic Evidence Request Loop
def build_evidence():
    return pv_svg(150, 'Confidence 0.58 below threshold, agent requests photo of tool flank', f'''
      <rect x="8" y="30" width="230" height="14" rx="7" fill="var(--warning-soft)"/>
      <rect x="8" y="30" width="{230 * 0.58}" height="14" rx="7" fill="var(--warning)"/>
      <line x1="{8 + 230 * 0.7}" y1="22" x2="{8 + 230 * 0.7}" y2="52" stroke="var(--ink)" stroke-width="1.5"/>
      {svg_text(8 + 230 * 0.7, 18, '0.70', anchor='middle', mono=True, size=10, fill='var(--ink)')}
      {svg_text(8, 68, 'confidence 0.58 · not enough to repair', mono=True, size=10.5, fill='#b4710a', weight=700)}
      {svg_arrow('M244 37 L282 37', dash='4 4')}
      {svg_box(286, 12, 226, 116, fill='#fff', stroke='var(--warning)', sw=1.6)}
      <rect x="302" y="28" width="58" height="44" rx="8" fill="var(--warning-soft)"/><circle cx="331" cy="50" r="12" fill="none" stroke="#b4710a" stroke-width="2"/><rect x="321" y="32" width="20" height="6" rx="2" fill="#b4710a"/>
      {svg_text(372, 44, 'Evidence request', fill='var(--ink)', weight=700, size=11.5)}
      {svg_text(372, 62, 'Photo · T07 flank', size=10.5)}
      {svg_text(302, 98, '→ Alex Morgan · Bay 4', mono=True, size=10.5, fill='var(--text)')}
      {svg_text(302, 116, 'loops until ≥ 0.70', size=10)}''')

# 16. Technician Macro Photo
def build_photo():
    return pv_svg(160, 'Technician photo of tool insert with flank wear VB measured at 0.38 mm', f'''
      {svg_box(8, 8, 220, 144, rx=12, fill='#f6f8fd')}
      <path d="M60 120 L118 34 L176 120 Z" fill="#dfe4f0" stroke="#94a3b8" stroke-width="1.4"/>
      <path d="M78 94 L158 94 L166 106 L70 106 Z" fill="rgba(229,72,77,.25)" stroke="var(--danger)" stroke-width="1.4"/>
      <path d="M190 94 L190 106 M186 94 L194 94 M186 106 L194 106" stroke="var(--danger)" stroke-width="1.6"/>
      {svg_text(196, 104, 'VB', mono=True, size=10, fill='var(--danger)', weight=700)}
      {svg_text(20, 26, 'IMG-CNC02-T07', mono=True, size=10, fill='var(--muted)')}
      {svg_text(250, 40, 'Flank wear VB', size=10.5)}
      {svg_text(250, 64, '0.38 mm', mono=True, size=18, weight=700, fill='var(--danger)')}
      {svg_text(350, 64, '> 0.30 limit', mono=True, size=10.5)}
      {svg_text(250, 100, 'Confidence', size=10.5)}
      {svg_text(250, 124, '0.58', mono=True, size=16, weight=700, fill='#b4710a')}
      {svg_arrow('M300 119 L346 119')}
      {svg_text(352, 124, '0.89', mono=True, size=16, weight=700, fill='#0e8a43')}
      {svg_text(250, 146, 'ISO 3685 · photo unlocks repair', size=10)}''')

# 17. Copilot Live Voice & Checklist
def build_copilot():
    wave = ''.join([
        f'<rect x="{12 + i * 6}" y="{46 - (6 + abs(math.sin(i * 0.7) * math.cos(i * 0.21)) * 34) / 2:.1f}" width="3.5" height="{6 + abs(math.sin(i * 0.7) * math.cos(i * 0.21)) * 34:.1f}" rx="1.75" fill="var(--accent)" opacity=".7"/>'
        for i in range(44)
    ])
    steps = ['Lock out', 'Swap insert', 'Torque 4.5 Nm']
    step_circles = ''.join([
        f'<circle cx="{40 + i * 200}" cy="112" r="12" fill="var(--success)"/><path d="M{34 + i * 200} 112 l4 4 l8 -8" stroke="#fff" stroke-width="2" fill="none"/>{svg_text(40 + i * 200, 142, s, anchor="middle", size=10.5, fill="var(--ink)")}'
        for i, s in enumerate(steps)
    ])
    return pv_svg(150, 'Live voice copilot guiding technician through 3 steps', f'''
      {svg_box(8, 14, 272, 64, rx=12, fill='#f6f8fd')}<g class="pv-breathe">{wave}</g>
      {svg_text(296, 34, '“Tighten Torx T15 screw', size=11, fill='var(--ink)')}{svg_text(296, 52, 'to 4.5 Nm.”', size=11, fill='var(--ink)')}
      {svg_text(296, 70, 'en-US · hands-free', mono=True, size=10)}
      <line x1="40" y1="112" x2="440" y2="112" stroke="var(--success)" stroke-width="2"/>
      {step_circles}''')

# 18. Continuous Learning & ESG
def build_learn():
    savings = [['Scrap avoided', 48.5, 'kg', 60], ['Energy saved', 312.4, 'kWh', 400], ['CO₂e avoided', 84.2, 'kg', 100]]
    bars = ''.join([
        f'{svg_text(280, 34 + i * 42, k, size=10.5)}'
        f'<rect x="280" y="{42 + i * 42}" width="160" height="10" rx="5" fill="rgba(15,23,42,.06)"/>'
        f'<rect x="280" y="{42 + i * 42}" width="{160 * v / m:.1f}" height="10" rx="5" fill="var(--success)"/>'
        f'{svg_text(512, 52 + i * 42, str(v) + " " + u, anchor="end", mono=True, size=10.5, fill="var(--ink)", weight=700)}'
        for i, (k, v, u, m) in enumerate(savings)
    ])
    return pv_svg(160, 'Knowledge base updated from SOP v4 to v5 with ESG savings', f'''
      {svg_box(8, 40, 96, 40, fill='#fff')}{svg_text(56, 64, 'SOP v4', anchor='middle', mono=True, fill='var(--muted)')}
      {svg_arrow('M104 60 L140 60')}
      {svg_box(142, 40, 110, 40, fill='var(--success-soft)', stroke='var(--success)', sw=1.6)}{svg_text(197, 64, 'SOP v5 + 8D', anchor='middle', mono=True, fill='#0e8a43', weight=700)}
      {svg_text(130, 108, 'vector commit VEC-SOP-CNC-T07-v5', anchor='middle', mono=True, size=9.5)}
      {svg_text(130, 126, 'next incident starts smarter', anchor='middle', size=10.5)}
      {bars}''')

# 19. Technician Checklist
def build_checklist():
    items = [['Lock-out / tag-out CNC-02', True], ['Replace T07 insert', True], ['Torque 4.5 Nm · confirm', True]]
    rows = ''.join([
        f'{svg_box(8, 10 + i * 44, 504, 36, fill="#fff", stroke="rgba(18,161,80,.4)" if d else "var(--hair-strong)")}'
        f'<circle cx="32" cy="{28 + i * 44}" r="11" fill="var(--success)" stroke="var(--success)"/>'
        f'<path d="M26 {28 + i * 44} l4 4 l8 -8" stroke="#fff" stroke-width="2" fill="none"/>'
        f'{svg_text(54, 32 + i * 44, str(i + 1) + ". " + t, size=11.5, fill="var(--ink)", weight=600)}'
        f'{svg_text(500, 32 + i * 44, "done", size=10.5, anchor="end", fill="#0e8a43", mono=True)}'
        for i, (t, d) in enumerate(items)
    ])
    return pv_svg(150, 'Technician 3-step repair checklist completed', f'''
      {rows}
      {svg_text(8, 146, 'glove-friendly 48 px steps · voice confirm', size=10.5)}''')

# 20. Dashboard KPI strip
def build_dashboard():
    kpis = ''.join([
        f'{svg_box(20 + i * 162, 20, 150, 46, fill="#fff")}'
        f'{svg_text(32 + i * 162, 38, k, size=10.5)}'
        f'{svg_text(32 + i * 162, 58, v, mono=True, size=15, weight=700, fill=c)}'
        for i, (k, v, c) in enumerate([['OEE', '86.4%', 'var(--ink)'], ['Incidents', '1', 'var(--danger)'], ['SPC', 'ALARM', 'var(--danger)']])
    ])
    return pv_svg(160, 'Plant ops dashboard with KPI strip and active incident card', f'''
      {svg_box(8, 8, 504, 144, rx=12, fill='#f6f8fd')}
      {kpis}
      {svg_box(20, 78, 474, 62, fill='#fff', stroke='var(--danger)', sw=1.4)}
      <rect x="20" y="78" width="5" height="62" rx="2" fill="var(--danger)"/>
      {svg_text(36, 100, 'INC-2026-B42 · CNC-02', mono=True, weight=700, fill='var(--ink)')}
      {svg_text(36, 120, 'Surface tear · RCA 0.89 · Alex Morgan', size=10.5)}
      <rect x="384" y="94" width="96" height="30" rx="15" fill="var(--ink)"/>{svg_text(432, 114, 'Open', anchor='middle', fill='#fff', weight=650)}''')

# 21. Shift Leader Signoff
def build_signoff():
    return pv_svg(150, 'Shift Leader approval unlocks only after 50 of 50 clean parts', f'''
      {svg_box(8, 10, 504, 130, rx=12, fill='#fff')}
      {svg_text(24, 36, '8D-2026-B42 · release sign-off', weight=700, fill='var(--ink)', size=12)}
      <rect x="24" y="50" width="300" height="10" rx="5" fill="var(--success)"/>
      {svg_text(336, 59, '50 / 50 clean', mono=True, size=10.5, fill='#0e8a43', weight=700)}
      <path d="M28 104 c14 -18 22 8 34 -6 s16 -10 26 2 s14 4 22 -4" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
      <line x1="24" y1="112" x2="200" y2="112" stroke="var(--hair-strong)"/>
      {svg_text(24, 128, 'David Vance · e-sign', size=10.5)}
      <rect x="300" y="84" width="196" height="40" rx="12" fill="var(--ink)"/>
      {svg_text(398, 109, 'Approve & close', anchor='middle', fill='#fff', weight=650)}
      {svg_text(398, 76, 'unlocked at 50/50 only', anchor='middle', size=10)}''')

# 22. 8D Documents
def build_docs():
    sec_cards = []
    for i, t in enumerate(['D1–D3', 'D4 Root cause', 'D5–D6 Fix', 'D7–D8 Sign-off']):
        box = svg_box(8 + i * 128, 10, 120, 84, fill="#fff")
        c_fill = "var(--success)" if i < 3 else "var(--hair-strong)"
        chk = f'<circle cx="{110 + i * 128}" cy="80" r="7" fill="var(--success)"/><path d="M{106 + i * 128} 80 l3 3 l5 -5" stroke="#fff" stroke-width="1.6" fill="none"/>' if i < 3 else ""
        txt = svg_text(68 + i * 128, 114, t, anchor="middle", size=10.5)
        sec_cards.append(f'''
          {box}
          <rect x="{22 + i * 128}" y="26" width="64" height="6" rx="3" fill="{c_fill}"/>
          <rect x="{22 + i * 128}" y="42" width="90" height="4" rx="2" fill="rgba(15,23,42,.08)"/>
          <rect x="{22 + i * 128}" y="52" width="70" height="4" rx="2" fill="rgba(15,23,42,.08)"/>
          <rect x="{22 + i * 128}" y="62" width="80" height="4" rx="2" fill="rgba(15,23,42,.08)"/>
          {chk}
          {txt}''')
    sections = ''.join(sec_cards)
    return pv_svg(130, '8D report sections D1 to D8', sections)

# 23. Decision Gate 1 (Confidence Threshold)
def build_confidence():
    return pv_svg(70, 'Confidence 0.89 above threshold 0.70', f'''
      <rect x="8" y="22" width="296" height="14" rx="7" fill="var(--warning-soft)"/>
      <rect x="215" y="22" width="89" height="14" rx="7" fill="var(--success-soft)"/>
      <line x1="215" y1="14" x2="215" y2="44" stroke="var(--ink)" stroke-width="1.5"/>
      {svg_text(215, 10, '0.70', anchor='middle', size=10, fill='var(--ink)', mono=True)}
      <circle cx="271" cy="29" r="7" fill="var(--accent)" stroke="#fff" stroke-width="2"/>
      {svg_text(8, 60, '< 0.70 → Diagnostic', size=10.5, fill='#b4710a', mono=True)}
      {svg_text(304, 60, '0.89 → Phase C', anchor='end', size=10.5, fill='#0e8a43', mono=True)}''', vb_w=312)

# 24. Streak Gauge (Gate 2 & Camera Verify)
def build_streak(n=42):
    c = 2 * math.pi * 26
    color = 'var(--danger)' if n == 0 else 'var(--accent)'
    return pv_svg(72, f'Clean streak {n} of 50', f'''
      <circle cx="40" cy="36" r="26" fill="none" stroke="rgba(15,23,42,.08)" stroke-width="7"/>
      <circle cx="40" cy="36" r="26" fill="none" stroke="{color}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="{c * n / 50:.1f} {c:.1f}" transform="rotate(-90 40 36)"/>
      {svg_text(40, 40, str(n) + "/50", anchor="middle", size=13, weight=700, fill="var(--ink)", mono=True)}
      {svg_text(84, 30, "Defect · streak reset to 0" if n == 0 else "Consecutive clean parts", size=12, weight=650, fill="var(--ink)")}
      {svg_text(84, 48, "Sign-off unlocks at 50/50", size=10.5, fill="var(--muted)", mono=True)}''', vb_w=312)

# 25. Acoustic Chatter
def build_acoustic():
    bars = ''.join([
        f'<rect x="{8 + i * 8.4:.1f}" y="{36 - (6 + abs(math.sin(i * 0.9)) * (40 if i > 22 else 16)) / 2:.1f}" width="5" height="{6 + abs(math.sin(i * 0.9)) * (40 if i > 22 else 16):.1f}" rx="2" fill="{"var(--warning)" if i > 22 else "var(--accent)"}" opacity="{1 if i > 22 else .55}"/>'
        for i in range(36)
    ])
    return pv_svg(72, 'Acoustic waveform with chatter band', f'''
      {bars}
      {svg_text(8, 70, '20 kHz · chatter band highlighted', size=10, fill='var(--muted)', mono=True)}''', vb_w=312)

# 26. Parametric Vibration RMS Trend
def build_telemetry():
    ys = [52, 50, 53, 49, 51, 48, 46, 47, 42, 38, 34, 27, 22, 18]
    pts = ' '.join([f"{12 + i * 22},{y}" for i, y in enumerate(ys)])
    return pv_svg(72, 'Spindle vibration trend crossing UCL', f'''
      <line x1="8" y1="24" x2="304" y2="24" stroke="var(--danger)" stroke-dasharray="4 4" stroke-width="1.2"/>
      {svg_text(304, 18, 'UCL 2.50', anchor='end', size=10, fill='var(--danger)', mono=True)}
      <polyline points="{pts}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="{12 + 13 * 22}" cy="18" r="4" fill="var(--danger)"/>
      {svg_text(8, 68, 'RMS mm/s · last 60 s', size=10, fill='var(--muted)', mono=True)}''', vb_w=312)

# 27. RCA Bar Chart
def build_rca():
    causes = [['Tool wear (insert)', 0.89], ['Spindle drift', 0.62], ['Coolant temp', 0.21]]
    bars = ''.join([
        f'{svg_text(8, 18 + i * 26, n, size=11, fill="var(--ink)")}'
        f'<rect x="150" y="{8 + i * 26}" width="130" height="12" rx="6" fill="rgba(15,23,42,.06)"/>'
        f'<rect x="150" y="{8 + i * 26}" width="{130 * v:.1f}" height="12" rx="6" fill="{"var(--accent)" if i == 0 else "var(--hair-strong)"}"/>'
        f'{svg_text(304, 18 + i * 26, f"{v:.2f}", anchor="end", size=10.5, fill="var(--text)", mono=True)}'
        for i, (n, v) in enumerate(causes)
    ])
    return pv_svg(84, 'Ranked root-cause candidates', bars, vb_w=312)


# 28. Output Documents (Operational Output & Regulatory Archive)
def build_output_docs():
    files = [
        ['8d_report.pdf', 'IATF 16949 D1–D8', '2.4 MB', 'var(--success)'],
        ['work_order_signed.pdf', 'CMMS WO-4481 · Signed', '850 KB', 'var(--info)'],
        ['sop_v5.json', 'Machining SOP Rev 5', '42 KB', 'var(--accent)']
    ]
    file_cards = ''.join([
        f'{svg_box(16 + i * 164, 46, 156, 72, rx=8, fill="#fff", stroke="var(--hair-strong)")}'
        f'<rect x="{26 + i * 164}" y="56" width="22" height="20" rx="4" fill="{c}" opacity=".15"/>'
        f'<path d="M{31 + i * 164} 61 h12 v10 h-12 z" fill="none" stroke="{c}" stroke-width="1.6"/>'
        f'{svg_text(54 + i * 164, 70, fn, mono=True, size=9.5, fill="var(--ink)", weight=700)}'
        f'{svg_text(26 + i * 164, 92, sub, size=9.5, fill="var(--text)")}'
        f'{svg_text(26 + i * 164, 106, sz, mono=True, size=9, fill="var(--muted)")}'
        for i, (fn, sub, sz, c) in enumerate(files)
    ])
    body = f'''
      {svg_box(8, 8, 504, 154, rx=12, fill="#f8fafd")}
      {svg_text(20, 28, "gs://kaizen-records/2026/INC-B42", mono=True, size=10.5, fill="var(--muted)")}
      <rect x="372" y="14" width="128" height="20" rx="6" fill="var(--success-soft)" stroke="rgba(18,161,80,.4)"/>
      <circle cx="384" cy="24" r="3.5" fill="var(--success)"/>
      {svg_text(394, 28, "APPROVED & LOCKED", mono=True, size=9.5, fill="#0e8a43", weight=700)}
      {file_cards}
      <line x1="16" y1="128" x2="504" y2="128" stroke="var(--hair)" stroke-width="1"/>
      {svg_text(20, 146, "Signed: David Vance (Shift Leader) · 2026-10-16 11:02:15 UTC", mono=True, size=9.5, fill="var(--ink)")}
      {svg_text(500, 146, "Permanent Audit Archive · ISO 9001", size=9.5, fill="var(--muted)", anchor="end")}'''
    return pv_svg(170, 'Operational output documents: certified 8D report, signed work order, and updated SOP', body)

svgs = {
    'floor-cameras.svg': build_camera(),
    'gcp-pubsub.svg': build_pubsub(),
    'gcp-bigquery.svg': build_bigquery(),
    'gcp-firestore.svg': build_firestore(),
    'gcp-rag.svg': build_rag(),
    'gcp-gemini.svg': build_gemini(),
    'adk-orch.svg': build_orchestrator(),
    'floor-machines.svg': build_machine(),
    'floor-sensors.svg': build_vibration(),
    'floor-tags.svg': build_tags(),
    'edge-gemma.svg': build_gemma(),
    'edge-bridge.svg': build_bridge(),
    'agent-qa.svg': build_spc(),
    'agent-tra.svg': build_genealogy(),
    'diagnostic-agent.svg': build_evidence(),
    'technician-photo.svg': build_photo(),
    'copilot-live.svg': build_copilot(),
    'agent-learn.svg': build_learn(),
    'human-tech.svg': build_checklist(),
    'human-dash.svg': build_dashboard(),
    'human-lead.svg': build_signoff(),
    'agent-scribe.svg': build_docs(),
    'decision-gate-1.svg': build_confidence(),
    'verify-camera.svg': build_streak(42),
    'decision-gate-2.svg': build_streak(42),
    'streak-reset.svg': build_streak(0),
    'floor-mics.svg': build_acoustic(),
    'agent-pa.svg': build_telemetry(),
    'agent-rca.svg': build_rca(),
    'output-docs.svg': build_output_docs()
}

for name, content in svgs.items():
    with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')

print(f'Successfully generated {len(svgs)} SVGs into {out_dir}')
