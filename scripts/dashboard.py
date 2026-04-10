#!/usr/bin/env python3
"""
Agent Team — Pipeline Dashboard
Run: python3 scripts/dashboard.py
Open: http://localhost:7892
"""

import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).parent.parent
STATE = REPO / ".state"
HANDOFFS = REPO / ".handoffs"
PORT = 7892

AGENTS = ["prd", "architect", "backend", "frontend", "qa", "docs", "devops"]


# ── Data readers ──────────────────────────────────────────────────────────────

def read_state():
    f = STATE / "PROJECT_STATE.md"
    if not f.exists():
        return {}
    data = {}
    for line in f.read_text().splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            data[k.strip()] = v.strip()
    return data


def read_handoffs():
    items = []
    if not HANDOFFS.exists():
        return items
    for f in sorted(HANDOFFS.glob("*.md")):
        content = f.read_text()
        lines = content.splitlines()

        qa_result = None
        prd_status = None
        has_conflicts = None

        if f.name == "QA_REPORT.md":
            for l in lines:
                if "Overall result:" in l:
                    raw = l.split("Overall result:", 1)[1].strip().strip("*").strip()
                    qa_result = raw
                    break

        if f.name == "PRD_REPORT.md":
            # Look for a bare PASS/WARN/BLOCK line or Status: <value> line
            for l in lines:
                clean = re.sub(r"[*`_#]", "", l).strip()
                if clean in ("PASS", "WARN", "BLOCK"):
                    prd_status = clean
                    break
                m = re.match(r"Status:\s*(PASS|WARN|BLOCK)", clean, re.IGNORECASE)
                if m:
                    prd_status = m.group(1).upper()
                    break

        if f.name == "ARCH_CONFLICTS.md":
            has_conflicts = not bool(re.search(r"Status:\s*NONE", content, re.IGNORECASE))

        items.append({
            "name": f.name,
            "lines": len(lines),
            "size": f.stat().st_size,
            "content": content,
            "qa_result": qa_result,
            "prd_status": prd_status,
            "has_conflicts": has_conflicts,
            "is_failed": "FAILED" in f.name or "BLOCKED" in f.name,
        })
    return items


def read_log(agent, tail=80):
    f = STATE / f"agent-{agent}.log"
    if not f.exists():
        return ""
    lines = f.read_text().splitlines()
    return "\n".join(lines[-tail:])


def read_phase_plan():
    f = STATE / "PHASE_PLAN.md"
    if not f.exists():
        return []
    phases = []
    current = None
    for line in f.read_text().splitlines():
        m = re.match(r"^## Phase (\d+):\s*(.+)", line)
        if m:
            if current:
                phases.append(current)
            current = {"num": int(m.group(1)), "name": m.group(2).strip(), "status": "PENDING"}
        elif current and "Status:" in line:
            current["status"] = line.split("Status:", 1)[1].strip()
    if current:
        phases.append(current)

    # Overlay statuses from PROJECT_STATE.md
    state = read_state()
    if phases and state:
        cur = int(state["Phase"]) if state.get("Phase", "").isdigit() else -1
        stage = state.get("Stage", "")
        for p in phases:
            if p["num"] < cur:
                p["status"] = "COMPLETE"
            elif p["num"] == cur:
                p["status"] = stage or "RUNNING"
            else:
                p["status"] = "PENDING"

    return phases


def read_escalation():
    f = STATE / "ESCALATION.md"
    return f.read_text() if f.exists() else None


def api_data():
    return {
        "state": read_state(),
        "handoffs": read_handoffs(),
        "phases": read_phase_plan(),
        "logs": {a: read_log(a) for a in AGENTS},
        "escalation": read_escalation(),
        "complete": (STATE / "PROJECT_COMPLETE.md").exists(),
        "paused": (STATE / "PAUSED.md").exists(),
    }


# ── HTML ──────────────────────────────────────────────────────────────────────

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Team — Pipeline</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #21253a;
    --border: #2e3348;
    --text: #e2e8f0;
    --dim: #64748b;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --blue: #3b82f6;
    --purple: #a855f7;
    --cyan: #06b6d4;
    --orange: #f97316;
    --font: 'Inter', system-ui, sans-serif;
    --mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }

  /* Layout */
  .layout { display: grid; grid-template-rows: auto auto 1fr; height: 100vh; }
  .header { padding: 14px 24px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 15px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--cyan); }
  .header .meta { margin-left: auto; font-size: 12px; color: var(--dim); display: flex; gap: 16px; align-items: center; }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; flex-shrink: 0; }
  .pulse.idle { background: var(--dim); animation: none; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  /* Phase bar */
  .phase-bar { padding: 10px 24px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; gap: 5px; overflow-x: auto; }
  .phase-chip { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); min-width: 56px; cursor: default; transition: all .15s; }
  .phase-chip .num { font-size: 11px; font-weight: 700; }
  .phase-chip .label { font-size: 9px; color: var(--dim); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; }
  .phase-chip.pending { opacity: .4; }
  .phase-chip.running { border-color: var(--yellow); background: rgba(234,179,8,.08); }
  .phase-chip.running .num { color: var(--yellow); }
  .phase-chip.complete { border-color: var(--green); background: rgba(34,197,94,.08); }
  .phase-chip.complete .num { color: var(--green); }
  .phase-chip.failed { border-color: var(--red); background: rgba(239,68,68,.08); }
  .phase-chip.failed .num { color: var(--red); }

  /* Main grid */
  .main { display: grid; grid-template-columns: 280px 1fr 340px; overflow: hidden; }

  /* Panels */
  .panel { border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
  .panel:last-child { border-right: none; }
  .panel-header { padding: 9px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); border-bottom: 1px solid var(--border); flex-shrink: 0; }

  /* Agents */
  .agent-list { padding: 6px; display: flex; flex-direction: column; gap: 3px; }
  .agent-row { padding: 9px 12px; border-radius: 7px; cursor: pointer; border: 1px solid transparent; transition: all .15s; display: flex; align-items: center; gap: 10px; }
  .agent-row:hover { background: var(--surface2); }
  .agent-row.active { border-color: var(--blue); background: rgba(59,130,246,.08); }
  .agent-row .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .agent-row .name { font-weight: 500; flex: 1; text-transform: capitalize; }
  .agent-row .status-text { font-size: 11px; }
  .dot.running { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); animation: pulse 1.5s infinite; }
  .dot.done { background: var(--green); }
  .dot.failed { background: var(--red); }
  .dot.blocked { background: var(--orange); }
  .dot.pending { background: var(--dim); }

  /* Handoffs */
  .handoff-list { padding: 6px; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; flex: 1; }
  .handoff-item { padding: 7px 11px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; transition: all .15s; }
  .handoff-item:hover { background: var(--surface2); }
  .handoff-item.active { border-color: var(--blue); }
  .handoff-item.failed-file { border-color: var(--red); }
  .handoff-item.warn-file { border-color: var(--orange); }
  .handoff-name { font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .handoff-meta { font-size: 11px; color: var(--dim); margin-top: 2px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap; }
  .badge.pass   { background: rgba(34,197,94,.15);  color: var(--green); }
  .badge.fail   { background: rgba(239,68,68,.15);  color: var(--red); }
  .badge.warn   { background: rgba(249,115,22,.15); color: var(--orange); }
  .badge.block  { background: rgba(239,68,68,.15);  color: var(--red); }
  .badge.conflict { background: rgba(234,179,8,.15); color: var(--yellow); }
  .badge.clear  { background: rgba(34,197,94,.1);   color: var(--green); }

  /* Center viewer */
  .handoff-viewer { flex: 1; overflow-y: auto; padding: 16px; }
  .handoff-viewer pre { font-family: var(--mono); font-size: 12px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; color: #94a3b8; }
  .viewer-placeholder { color: var(--dim); font-size: 13px; padding: 32px; text-align: center; }

  /* Log panel */
  .log-tabs { padding: 6px; display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .log-tab { padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--dim); transition: all .15s; text-transform: capitalize; }
  .log-tab:hover { border-color: var(--blue); color: var(--text); }
  .log-tab.active { background: var(--blue); border-color: var(--blue); color: #fff; }
  .log-tab.has-log { color: var(--text); }
  .log-area { flex: 1; overflow-y: auto; padding: 12px 16px; }
  .log-content { font-family: var(--mono); font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-all; color: #94a3b8; }

  /* Escalation / status banners */
  .banner { margin: 6px; padding: 10px 14px; border-radius: 8px; font-size: 12px; }
  .banner.escalation { background: rgba(239,68,68,.1); border: 1px solid var(--red); }
  .banner.escalation strong { color: var(--red); }
  .banner.complete { background: rgba(34,197,94,.1); border: 1px solid var(--green); color: var(--green); }
  .banner.paused { background: rgba(234,179,8,.1); border: 1px solid var(--yellow); color: var(--yellow); }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
</head>
<body>
<div class="layout">

  <!-- Header -->
  <div class="header">
    <div class="pulse" id="pulse"></div>
    <h1>Agent Team — Pipeline</h1>
    <div class="meta">
      <span id="current-phase">Phase —</span>
      <span id="current-stage">—</span>
      <span id="last-updated"></span>
    </div>
  </div>

  <!-- Phase bar -->
  <div class="phase-bar" id="phase-bar"></div>

  <!-- Main -->
  <div class="main">

    <!-- Left: Agents + Handoffs -->
    <div class="panel">
      <div class="panel-header">Agents</div>
      <div class="agent-list" id="agent-list"></div>

      <div class="panel-header" style="margin-top:6px">Handoffs</div>
      <div class="handoff-list" id="handoff-list"></div>

      <div id="status-banners"></div>
    </div>

    <!-- Center: Content viewer -->
    <div class="panel">
      <div class="panel-header" id="viewer-title">Select a file to preview</div>
      <div class="handoff-viewer" id="handoff-viewer">
        <div class="viewer-placeholder">Click a handoff file or agent to view its content</div>
      </div>
    </div>

    <!-- Right: Logs -->
    <div class="panel">
      <div class="panel-header">Agent Logs</div>
      <div class="log-tabs" id="log-tabs"></div>
      <div class="log-area" id="log-area">
        <div class="log-content" id="log-content" style="color:var(--dim)">Select an agent tab to view its log</div>
      </div>
    </div>

  </div>
</div>

<script>
const AGENTS = ['prd','architect','backend','frontend','qa','docs','devops'];
let activeLogTab = null;
let activeHandoff = null;
let data = {};

// Map agent name → PROJECT_STATE.md key
function agentKey(a) {
  if (a === 'prd') return 'PRD';
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function statusDot(s) {
  if (!s) return 'pending';
  const u = s.toUpperCase();
  if (u.includes('RUNNING')) return 'running';
  if (u.includes('DONE') || u.includes('COMPLETE')) return 'done';
  if (u.includes('FAILED')) return 'failed';
  if (u.includes('BLOCKED')) return 'blocked';
  return 'pending';
}

function dotColor(dot) {
  return { running: 'yellow', done: 'green', failed: 'red', blocked: 'orange', pending: 'dim' }[dot] || 'dim';
}

function phaseClass(status) {
  if (!status) return 'pending';
  const s = status.toUpperCase();
  if (s === 'COMPLETE' || s === 'DONE') return 'complete';
  if (s === 'PENDING') return 'pending';
  if (s.includes('FAIL')) return 'failed';
  // Any active stage name counts as running
  const activeStages = ['PRD','ARCHITECT','BACKEND','FRONTEND','QA','DOCS','DEVOPS','RUNNING'];
  if (activeStages.some(k => s.includes(k))) return 'running';
  return 'pending';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function handoffBadges(h) {
  const badges = [];
  if (h.qa_result === 'PASS') badges.push('<span class="badge pass">PASS</span>');
  if (h.qa_result === 'FAIL') badges.push('<span class="badge fail">FAIL</span>');
  if (h.prd_status === 'PASS') badges.push('<span class="badge pass">PASS</span>');
  if (h.prd_status === 'WARN') badges.push('<span class="badge warn">WARN</span>');
  if (h.prd_status === 'BLOCK') badges.push('<span class="badge block">BLOCK</span>');
  if (h.has_conflicts === true)  badges.push('<span class="badge conflict">CONFLICTS</span>');
  if (h.has_conflicts === false) badges.push('<span class="badge clear">CLEAR</span>');
  return badges.join('');
}

function render(d) {
  data = d;
  const st = d.state || {};
  const phase = parseInt(st['Phase'] ?? -1);
  const stage = st['Stage'] || '—';

  // Header
  document.getElementById('current-phase').textContent = phase >= 0 ? `Phase ${phase}` : 'Phase —';
  document.getElementById('current-stage').textContent = stage;
  const lu = st['Last updated'];
  document.getElementById('last-updated').textContent = lu ? `Updated ${lu.split('T')[1] || lu}` : '';

  const isActive = !d.complete && !d.paused && stage && stage !== '—' && stage !== 'ALL_PHASES_COMPLETE';
  document.getElementById('pulse').className = 'pulse' + (isActive ? '' : ' idle');

  // Phase bar — names come from data, not hardcoded
  document.getElementById('phase-bar').innerHTML = (d.phases || []).map(p => {
    const cls = phaseClass(p.status);
    return `<div class="phase-chip ${cls}" title="Phase ${p.num}: ${escHtml(p.name)}\nStatus: ${p.status}">
      <span class="num">${p.num}</span>
      <span class="label">${escHtml(p.name)}</span>
    </div>`;
  }).join('') || '<span style="color:var(--dim);font-size:12px">No phase plan yet</span>';

  // Agents
  document.getElementById('agent-list').innerHTML = AGENTS.map(a => {
    const key = agentKey(a);
    const raw = st[key] || 'PENDING';
    const dot = statusDot(raw);
    const col = dotColor(dot);
    const isAct = activeLogTab === a;
    return `<div class="agent-row${isAct ? ' active' : ''}" onclick="selectAgent('${a}')">
      <div class="dot ${dot}"></div>
      <div class="name">${key}</div>
      <div class="status-text" style="color:var(--${col})">${raw.split(' ')[0]}</div>
    </div>`;
  }).join('');

  // Handoffs
  const hList = document.getElementById('handoff-list');
  if (d.handoffs && d.handoffs.length) {
    hList.innerHTML = d.handoffs.map(h => {
      const isAct = activeHandoff === h.name;
      const warnFile = h.has_conflicts === true;
      const cls = h.is_failed ? ' failed-file' : warnFile ? ' warn-file' : '';
      const icon = h.is_failed ? '✗' : warnFile ? '⚠' : '✓';
      const iconColor = h.is_failed ? 'red' : warnFile ? 'orange' : 'green';
      return `<div class="handoff-item${isAct ? ' active' : ''}${cls}" onclick="selectHandoff('${escHtml(h.name)}')">
        <div class="handoff-name">
          <span style="color:var(--${iconColor})">${icon}</span>
          ${escHtml(h.name)}
          ${handoffBadges(h)}
        </div>
        <div class="handoff-meta">${h.lines} lines · ${(h.size/1024).toFixed(1)} KB</div>
      </div>`;
    }).join('');
  } else {
    hList.innerHTML = '<div style="padding:12px;color:var(--dim);font-size:12px">No handoff files yet</div>';
  }

  // Status banners
  const banners = document.getElementById('status-banners');
  if (d.escalation) {
    const preview = d.escalation.split('\n').slice(0, 8).join('\n');
    banners.innerHTML = `<div class="banner escalation"><strong>⚠ Escalation — human input required</strong><pre style="margin-top:6px;font-size:11px;white-space:pre-wrap">${escHtml(preview)}</pre></div>`;
  } else if (d.paused) {
    banners.innerHTML = `<div class="banner paused">⏸ Pipeline paused</div>`;
  } else if (d.complete) {
    banners.innerHTML = `<div class="banner complete">✓ All phases complete</div>`;
  } else {
    banners.innerHTML = '';
  }

  // Log tabs
  document.getElementById('log-tabs').innerHTML = AGENTS.map(a => {
    const hasLog = d.logs && d.logs[a] && d.logs[a].length > 0;
    const isAct = activeLogTab === a;
    return `<button class="log-tab${isAct ? ' active' : ''}${hasLog ? ' has-log' : ''}" onclick="selectAgent('${a}')">${a}</button>`;
  }).join('');

  // Auto-select the running agent's log if nothing is selected
  if (!activeLogTab) {
    const running = AGENTS.find(a => (st[agentKey(a)] || '').includes('RUNNING'));
    if (running) selectAgent(running);
  }

  // Refresh log content
  if (activeLogTab && d.logs) {
    const logArea = document.getElementById('log-area');
    const logEl = document.getElementById('log-content');
    const atBottom = logArea.scrollHeight - logArea.scrollTop <= logArea.clientHeight + 40;
    logEl.textContent = d.logs[activeLogTab] || '(no output yet)';
    if (atBottom) logArea.scrollTop = logArea.scrollHeight;
  }

  // Refresh handoff viewer
  if (activeHandoff && d.handoffs) {
    const hf = d.handoffs.find(h => h.name === activeHandoff);
    if (hf) showContent(hf.name, hf.content);
  }
}

function selectAgent(a) {
  activeLogTab = a;
  activeHandoff = null;
  const key = agentKey(a);
  document.getElementById('viewer-title').textContent = `Log — ${key}`;

  const logEl = document.getElementById('log-content');
  const logArea = document.getElementById('log-area');
  const log = (data.logs || {})[a] || '';
  logEl.textContent = log || '(no output yet)';
  logArea.scrollTop = logArea.scrollHeight;

  document.querySelectorAll('.log-tab').forEach(t => t.classList.toggle('active', t.textContent === a));
  document.querySelectorAll('.agent-row').forEach(r => {
    r.classList.toggle('active', r.querySelector('.name').textContent === key);
  });
  document.querySelectorAll('.handoff-item').forEach(el => el.classList.remove('active'));
}

function selectHandoff(name) {
  activeHandoff = name;
  activeLogTab = null;
  if (data.handoffs) {
    const hf = data.handoffs.find(h => h.name === name);
    if (hf) showContent(hf.name, hf.content);
  }
  document.querySelectorAll('.handoff-item').forEach(el => {
    el.classList.toggle('active', el.querySelector('.handoff-name').textContent.includes(name));
  });
  document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.agent-row').forEach(r => r.classList.remove('active'));
}

function showContent(title, content) {
  document.getElementById('viewer-title').textContent = title;
  document.getElementById('handoff-viewer').innerHTML = `<pre>${escHtml(content)}</pre>`;
}

async function poll() {
  try {
    const res = await fetch('/api/data');
    if (res.ok) render(await res.json());
  } catch(e) {}
}

poll();
setInterval(poll, 2500);
</script>
</body>
</html>
"""


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence access logs

    def send_json(self, data):
        body = json.dumps(data, default=str).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html):
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            self.send_html(HTML)
        elif self.path == "/api/data":
            self.send_json(api_data())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    os.chdir(REPO)
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Agent Team dashboard → http://localhost:{PORT}")
    print("Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
