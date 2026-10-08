"""API Entrypoint: FastAPI backend server serving incident board APIs and WebSocket/SSE streams."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from backend.agents.orchestrator import orchestrator
from backend.api.routes_gemini_live import router as gemini_live_router
from backend.api.routes_impact import router as impact_router
from backend.api.routes_incidents import router as incidents_router
from backend.api.routes_simulation import router as simulation_router
from backend.api.routes_telemetry import router as telemetry_router
from backend.core.config import settings

logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Stops any running incident on shutdown."""
    yield
    await orchestrator.cancel()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Kaizen Agent: Product-first AI Team for Manufacturing Anomaly Detection and Root-Cause Tracing",
    lifespan=lifespan,
)

app.include_router(incidents_router)
app.include_router(simulation_router)
app.include_router(gemini_live_router)
app.include_router(impact_router)
app.include_router(telemetry_router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.version,
        "gcp_project": settings.gcp_project_id,
    }


@app.get("/", response_class=HTMLResponse)
async def dashboard_view():
    """Serves the live interactive Kaizen Agent command center dashboard."""
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaizen Agent - Autonomous Line Quality & RCA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090D16;
      --card-bg: rgba(17, 24, 39, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --cyan: #06B6D4;
      --emerald: #10B981;
      --amber: #F59E0B;
      --rose: #F43F5E;
      --purple: #8B5CF6;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #171E31 0%, var(--bg) 70%);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
    }
    .logo-area { display: flex; align-items: center; gap: 14px; }
    .badge-icon {
      width: 42px; height: 42px; border-radius: 10px;
      background: linear-gradient(135deg, var(--purple), var(--cyan));
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 20px; color: #fff;
    }
    .logo-title h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .logo-title p { font-size: 13px; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    button {
      padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 13px;
      cursor: pointer; transition: all 0.2s ease; border: none;
    }
    .btn-inject {
      background: linear-gradient(135deg, var(--rose), #E11D48);
      color: white; box-shadow: 0 4px 14px rgba(244, 63, 94, 0.4);
    }
    .btn-inject:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(244, 63, 94, 0.6); }
    .btn-reset {
      background: rgba(255, 255, 255, 0.08); color: var(--text);
      border: 1px solid var(--card-border);
    }
    .btn-reset:hover { background: rgba(255, 255, 255, 0.14); }
    .status-pill {
      padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 8px;
    }
    .status-normal { background: rgba(16, 185, 129, 0.15); color: var(--emerald); border: 1px solid var(--emerald); }
    .status-alert { background: rgba(244, 63, 94, 0.15); color: var(--rose); border: 1px solid var(--rose); animation: pulse 1.5s infinite; }
    .status-resolving { background: rgba(245, 158, 11, 0.15); color: var(--amber); border: 1px solid var(--amber); }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.02); }
    }

    /* Grid Layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 20px;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-title {
      font-size: 14px; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center;
    }

    /* Production Line Visualizer */
    .line-container {
      display: grid;
      grid-template-columns: repeat(3, 1fr) 0.8fr;
      gap: 12px;
    }
    .machine-box {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      display: flex; flex-direction: column; gap: 8px;
      position: relative;
    }
    .machine-box.defective {
      border-color: var(--rose);
      background: rgba(244, 63, 94, 0.08);
    }
    .machine-status-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--emerald); display: inline-block;
    }
    .machine-box.defective .machine-status-dot { background: var(--rose); box-shadow: 0 0 10px var(--rose); }
    .machine-title { font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; }
    .machine-metric { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

    /* SPC Chart */
    .spc-container {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 16px;
      height: 140px;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .spc-bar-wrapper {
      display: flex; align-items: flex-end; gap: 6px; height: 90px;
    }
    .spc-bar {
      flex: 1; background: var(--emerald); border-radius: 4px 4px 0 0;
      transition: height 0.3s ease, background 0.3s ease;
    }
    .spc-bar.spike { background: var(--rose); }

    /* Incident Board Timeline */
    .findings-stream {
      display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto;
      padding-right: 6px;
    }
    .finding-card {
      background: rgba(255, 255, 255, 0.03);
      border-left: 4px solid var(--purple);
      border-radius: 0 10px 10px 0;
      padding: 14px;
      display: flex; flex-direction: column; gap: 6px;
      animation: fadeIn 0.4s ease;
    }
    .finding-header {
      display: flex; justify-content: space-between; align-items: center;
    }
    .agent-tag {
      font-size: 12px; font-weight: 700; color: var(--cyan);
      display: inline-flex; align-items: center; gap: 6px;
    }
    .confidence-badge {
      font-family: var(--font-mono); font-size: 11px;
      background: rgba(6, 182, 212, 0.15); color: var(--cyan);
      padding: 2px 8px; border-radius: 12px;
    }
    .finding-text { font-size: 13px; font-weight: 500; }
    .evidence-text { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
    .citation-tag { font-size: 11px; color: var(--amber); margin-top: 2px; }

    /* Impact Card */
    .impact-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    }
    .impact-box {
      background: rgba(0, 0, 0, 0.25); border: 1px solid var(--card-border);
      border-radius: 10px; padding: 12px; text-align: center;
    }
    .impact-val { font-size: 20px; font-weight: 700; font-family: var(--font-mono); color: var(--emerald); }
    .impact-lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    /* Tech Copilot Live Speech Box */
    .dialog-box {
      background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;
    }
    .dialog-speaker { font-size: 12px; font-weight: 600; color: var(--purple); }
    .dialog-content { font-size: 13px; line-height: 1.4; color: #E9D5FF; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>

  <header>
    <div class="logo-area">
      <div class="badge-icon">K</div>
      <div class="logo-title">
        <h1>Kaizen Agent Command Center</h1>
        <p>Product-First Defect & Root Cause Tracing System (ADK + Google Cloud)</p>
      </div>
    </div>
    <div class="header-actions">
      <span id="incidentStatus" class="status-pill status-normal">● Status: Baseline Normal</span>
      <button class="btn-inject" onclick="injectDefect()">⚡ Inject Defect (Demo)</button>
      <button class="btn-reset" onclick="resetDemo()">↺ Reset</button>
    </div>
  </header>

  <div class="dashboard-grid">
    <!-- Left Column: Production Floor & Analytics -->
    <div style="display: flex; flex-direction: column; gap: 20px;">

      <!-- Virtual Production Line -->
      <div class="card">
        <div class="card-title">
          <span>Factory Floor: Line #1 (Aluminum Machining)</span>
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--cyan);">Batch: AL-5083-B4</span>
        </div>
        <div class="line-container">
          <div class="machine-box" id="box-cnc01">
            <div class="machine-title"><span class="machine-status-dot"></span> CNC-01</div>
            <div class="machine-metric">Tool: T04 (Good)</div>
            <div class="machine-metric">Vib: 0.12 mm/s</div>
          </div>
          <div class="machine-box" id="box-cnc02">
            <div class="machine-title"><span class="machine-status-dot"></span> CNC-02</div>
            <div class="machine-metric" id="cnc02-tool">Tool: T07 (Good)</div>
            <div class="machine-metric" id="cnc02-vib">Vib: 0.14 mm/s</div>
          </div>
          <div class="machine-box" id="box-cnc03">
            <div class="machine-title"><span class="machine-status-dot"></span> CNC-03</div>
            <div class="machine-metric">Tool: T07 (Good)</div>
            <div class="machine-metric">Vib: 0.13 mm/s</div>
          </div>
          <div class="machine-box" style="border-style: dashed;">
            <div class="machine-title">📷 Camera Station</div>
            <div class="machine-metric">Gemma Edge Gateway</div>
            <div class="machine-metric" id="cam-rate">Defect: 0.4%</div>
          </div>
        </div>
      </div>

      <!-- Real-time SPC Defect Rate Chart -->
      <div class="card">
        <div class="card-title">
          <span>Statistical Process Control (SPC) - Face A Scratch Rate</span>
          <span id="spc-label" style="font-family: var(--font-mono); font-size: 12px; color: var(--emerald);">0.4% (Normal)</span>
        </div>
        <div class="spc-container">
          <div class="spc-bar-wrapper" id="spc-bars">
            <!-- Simulated history bars -->
            <div class="spc-bar" style="height: 15%;"></div>
            <div class="spc-bar" style="height: 18%;"></div>
            <div class="spc-bar" style="height: 12%;"></div>
            <div class="spc-bar" style="height: 14%;"></div>
            <div class="spc-bar" style="height: 16%;"></div>
            <div class="spc-bar" style="height: 15%;"></div>
            <div class="spc-bar" style="height: 14%;"></div>
            <div class="spc-bar" style="height: 15%;"></div>
            <div class="spc-bar" id="live-spc-bar" style="height: 15%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
            <span>09:20</span>
            <span style="color: var(--rose);">--- Upper Control Limit (UCL = 3.0%) ---</span>
            <span>09:50 (Now)</span>
          </div>
        </div>
      </div>

      <!-- Live Technician Voice Copilot Simulator -->
      <div class="card">
        <div class="card-title">
          <span>Technician Copilot (Gemini Live - Vietnamese Voice & Camera)</span>
          <span style="color: var(--purple); font-size: 12px;">Active Session #VN-902</span>
        </div>
        <div class="dialog-box" id="copilot-box">
          <div class="dialog-speaker">🤖 Technician Copilot (Gemini Live)</div>
          <div class="dialog-content" id="copilot-msg">
            Đang lắng nghe từ trạm máy... Dây chuyền hoạt động bình thường.
          </div>
        </div>
      </div>

      <!-- Sustainability Impact Card -->
      <div class="card">
        <div class="card-title">
          <span>Sustainability & Kaizen Impact Card</span>
          <span style="color: var(--emerald); font-size: 12px;">Product-first ROI</span>
        </div>
        <div class="impact-grid">
          <div class="impact-box">
            <div class="impact-val" id="impact-scrap">0</div>
            <div class="impact-lbl">Scrap Avoided (pts)</div>
          </div>
          <div class="impact-box">
            <div class="impact-val" id="impact-time">0m</div>
            <div class="impact-lbl">Downtime Saved</div>
          </div>
          <div class="impact-box">
            <div class="impact-val" id="impact-kwh">0</div>
            <div class="impact-lbl">kWh Conserved</div>
          </div>
          <div class="impact-box">
            <div class="impact-val" id="impact-co2">0kg</div>
            <div class="impact-lbl">CO2 Reduction</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Right Column: Live Blackboard Stream -->
    <div class="card" style="height: 100%;">
      <div class="card-title">
        <span>Shared Incident State (Firestore Blackboard)</span>
        <span id="incident-id-tag" style="font-family: var(--font-mono); font-size: 12px; color: var(--purple);">INC-READY</span>
      </div>
      <div class="findings-stream" id="findingsStream">
        <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px;">
          Waiting for defect detection... Click <b>"Inject Defect"</b> above to start the multi-agent incident loop.
        </div>
      </div>
    </div>
  </div>

  <script>
    let evtSource = null;

    function initSSE() {
      if (evtSource) evtSource.close();
      evtSource = new EventSource('/api/incidents/events');
      evtSource.addEventListener('incident_update', (e) => {
        const state = JSON.parse(e.data);
        renderState(state);
      });
    }

    function renderState(state) {
      const statusPill = document.getElementById('incidentStatus');
      const incTag = document.getElementById('incident-id-tag');
      const boxCnc02 = document.getElementById('box-cnc02');
      const cnc02Tool = document.getElementById('cnc02-tool');
      const cnc02Vib = document.getElementById('cnc02-vib');
      const camRate = document.getElementById('cam-rate');
      const spcLabel = document.getElementById('spc-label');
      const liveSpcBar = document.getElementById('live-spc-bar');
      const copilotMsg = document.getElementById('copilot-msg');
      const stream = document.getElementById('findingsStream');

      incTag.innerText = state.incident_id || 'INC-READY';

      // Update status pill
      if (state.status === 'normal') {
        statusPill.className = 'status-pill status-normal';
        statusPill.innerHTML = '● Status: Baseline Normal';
        boxCnc02.classList.remove('defective');
        cnc02Tool.innerText = 'Tool: T07 (Good)';
        cnc02Vib.innerText = 'Vib: 0.14 mm/s';
        camRate.innerText = 'Defect: 0.4%';
        spcLabel.innerText = '0.4% (Normal)';
        spcLabel.style.color = 'var(--emerald)';
        liveSpcBar.style.height = '15%';
        liveSpcBar.classList.remove('spike');
        copilotMsg.innerText = 'Đang lắng nghe từ trạm máy... Dây chuyền hoạt động bình thường.';
      } else if (state.status === 'closed') {
        statusPill.className = 'status-pill status-normal';
        statusPill.innerHTML = state.approved
          ? '✔ Status: Incident Closed & Approved'
          : '✔ Status: Verified, Awaiting Shift Leader Approval';
        boxCnc02.classList.remove('defective');
        camRate.innerText = 'Defect: 0.4%';
        spcLabel.innerText = '0.4% (Verified Pass)';
        spcLabel.style.color = 'var(--emerald)';
        liveSpcBar.style.height = '15%';
        liveSpcBar.classList.remove('spike');
      } else {
        statusPill.className = 'status-pill status-alert';
        statusPill.innerHTML = '▲ Status: ' + state.status.toUpperCase();
        if (state.defect_rate > 0.03) {
          boxCnc02.classList.add('defective');
          cnc02Tool.innerText = 'Tool: T07 (Wear Alert)';
          cnc02Vib.innerText = 'Vib: 0.22 mm/s (+35%)';
          camRate.innerText = (state.defect_rate * 100).toFixed(1) + '% (Scratch)';
          spcLabel.innerText = (state.defect_rate * 100).toFixed(1) + '% (UCL Exceeded)';
          spcLabel.style.color = 'var(--rose)';
          liveSpcBar.style.height = '85%';
          liveSpcBar.classList.add('spike');
        }
      }

      // Update Tech copilot text if repairing or analyzing
      if (state.status === 'repairing') {
        copilotMsg.innerHTML = '<b>Kỹ thuật viên:</b> "Máy này bị gì, tôi phải làm sao?"<br>' +
          '<b>Copilot:</b> "Chào anh, dao T07 mòn quá tuổi thọ 2.000 chi tiết. Theo sổ tay CNC trang 112, anh tháo nắp trái, thay insert mới và kiểm tra độ đảo dao nhé."';
      } else if (state.status === 'verifying') {
        copilotMsg.innerHTML = '<b>Kiểm tra chất lượng:</b> Đang gác cổng xác nhận: ' +
          state.verification_count + '/' + state.verification_target + ' sản phẩm đạt liên tiếp trên băng chuyền...';
      }

      // Update impact
      if (state.impact) {
        document.getElementById('impact-scrap').innerText = state.impact.scrap_avoided;
        document.getElementById('impact-time').innerText = state.impact.downtime_minutes + 'm';
        document.getElementById('impact-kwh').innerText = state.impact.energy_kwh;
        document.getElementById('impact-co2').innerText = state.impact.co2_kg + 'kg';
      } else {
        document.getElementById('impact-scrap').innerText = '0';
        document.getElementById('impact-time').innerText = '0m';
        document.getElementById('impact-kwh').innerText = '0';
        document.getElementById('impact-co2').innerText = '0kg';
      }

      // Render findings list
      if (state.findings && state.findings.length > 0) {
        stream.innerHTML = state.findings.map(f => `
          <div class="finding-card">
            <div class="finding-header">
              <span class="agent-tag">⚡ ${f.agent_name} <span style="color: var(--text-muted); font-size: 11px;">(${f.phase})</span></span>
              <span class="confidence-badge">${(f.confidence * 100).toFixed(0)}% Conf</span>
            </div>
            <div class="finding-text">${f.finding}</div>
            <div class="evidence-text">Evidence: ${f.evidence}</div>
            <div class="citation-tag">📖 Source: ${f.citation}</div>
          </div>
        `).join('');
      } else if (state.status === 'normal') {
        stream.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px;">Waiting for defect detection... Click <b>"Inject Defect"</b> above to start the multi-agent incident loop.</div>';
      }
    }

    async function injectDefect() {
      await fetch('/api/simulation/inject', { method: 'POST' });
    }

    async function resetDemo() {
      await fetch('/api/simulation/reset', { method: 'POST' });
    }

    // Auto connect
    initSSE();
  </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)
