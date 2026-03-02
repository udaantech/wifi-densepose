// Security Settings Tab — Zone Management, System Metrics, Stream Clients

import { poseService } from '../services/pose.service.js';
import { healthService } from '../services/health.service.js';
import { streamService } from '../services/stream.service.js';
import { alertService } from '../services/alert.service.js';

const ROOM_LABELS = {
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  hallway: 'Hallway',
};

export class SettingsTab {
  constructor(container) {
    this.container = container;
    this._pollInterval = null;
    this._zoneData = {};
    this._selectedZone = null;
  }

  async init() {
    this._buildDOM();
    this._bindEvents();
    await this._refreshAll();
    this._startPolling();
  }

  _buildDOM() {
    this.container.innerHTML = `
      <h2>Security Settings</h2>

      <div class="settings-grid">
        <!-- Zone Management -->
        <div class="settings-panel settings-zones">
          <h3>Zone Management</h3>
          <div class="zone-list" id="settingsZoneList">
            <div class="settings-empty">Loading zones...</div>
          </div>
          <div class="zone-detail" id="settingsZoneDetail">
            <div class="settings-empty">Select a zone to view details</div>
          </div>
        </div>

        <!-- Alert Rules (Enhanced) -->
        <div class="settings-panel settings-rules">
          <h3>Alert Rules Configuration</h3>
          <div class="rules-list" id="settingsRulesList"></div>
          <div class="rule-editor" id="settingsRuleEditor" style="display:none;">
            <h4 id="ruleEditorTitle">Edit Rule</h4>
            <div class="rule-form">
              <div class="form-row">
                <label>Severity</label>
                <select id="ruleEditSeverity" class="settings-select">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div class="form-row">
                <label>Monitored Zones</label>
                <div class="zone-checkboxes" id="ruleEditZones"></div>
              </div>
              <div class="form-row rule-actions">
                <button id="ruleEditSave" class="btn btn--primary btn--sm">Save Changes</button>
                <button id="ruleEditCancel" class="btn btn--secondary btn--sm">Cancel</button>
                <button id="ruleEditTest" class="btn btn--secondary btn--sm">Test Rule</button>
              </div>
              <div class="rule-test-result" id="ruleTestResult" style="display:none;"></div>
            </div>
          </div>
        </div>

        <!-- System Metrics (Full) -->
        <div class="settings-panel settings-metrics">
          <h3>System Resources</h3>
          <div class="metrics-grid" id="settingsMetrics">
            <div class="settings-empty">Loading metrics...</div>
          </div>
        </div>

        <!-- Connected Clients -->
        <div class="settings-panel settings-clients">
          <h3>Connected Clients</h3>
          <div class="stream-status-bar" id="settingsStreamStatus"></div>
          <div class="clients-list" id="settingsClients">
            <div class="settings-empty">Loading clients...</div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#ruleEditSave').addEventListener('click', () => this._saveRule());
    this.container.querySelector('#ruleEditCancel').addEventListener('click', () => this._cancelRuleEdit());
    this.container.querySelector('#ruleEditTest').addEventListener('click', () => this._testRule());
  }

  async _refreshAll() {
    await Promise.allSettled([
      this._refreshZones(),
      this._refreshRules(),
      this._refreshMetrics(),
      this._refreshClients(),
    ]);
  }

  // --- Zone Management ---
  async _refreshZones() {
    try {
      const summary = await poseService.getZonesSummary();
      const zones = summary?.zones || {};
      this._zoneData = zones;
      this._renderZoneList(zones);
    } catch (e) {
      this._renderZoneList({});
    }
  }

  _renderZoneList(zones) {
    const container = this.container.querySelector('#settingsZoneList');
    if (Object.keys(zones).length === 0) {
      container.innerHTML = '<div class="settings-empty">No zones discovered. Run Calibration first.</div>';
      return;
    }

    container.innerHTML = '';
    for (const [zoneId, data] of Object.entries(zones)) {
      const count = typeof data === 'object' ? (data.occupancy || data.person_count || data.count || 0) : data;
      const el = document.createElement('div');
      el.className = `zone-list-item ${this._selectedZone === zoneId ? 'selected' : ''} ${count > 0 ? 'occupied' : ''}`;
      el.innerHTML = `
        <span class="zone-dot ${count > 0 ? 'active' : ''}"></span>
        <span class="zone-name">${ROOM_LABELS[zoneId] || zoneId}</span>
        <span class="zone-count">${count} person${count !== 1 ? 's' : ''}</span>
      `;
      el.addEventListener('click', () => this._selectZone(zoneId));
      container.appendChild(el);
    }
  }

  async _selectZone(zoneId) {
    this._selectedZone = zoneId;
    // Re-render list to update selected state
    this._renderZoneList(this._zoneData);

    const detail = this.container.querySelector('#settingsZoneDetail');
    detail.innerHTML = '<div class="settings-empty">Loading zone details...</div>';

    try {
      const data = await poseService.getZoneOccupancy(zoneId);
      this._renderZoneDetail(zoneId, data);
    } catch (e) {
      detail.innerHTML = `<div class="settings-empty">Could not load details for ${ROOM_LABELS[zoneId] || zoneId}</div>`;
    }
  }

  _renderZoneDetail(zoneId, data) {
    const detail = this.container.querySelector('#settingsZoneDetail');
    const label = ROOM_LABELS[zoneId] || zoneId;
    const persons = data.persons || [];
    const maxOccupancy = data.max_occupancy || '--';
    const current = data.current_occupancy || 0;

    let personsHtml = '';
    if (persons.length === 0) {
      personsHtml = '<div class="settings-empty">No persons detected</div>';
    } else {
      for (const p of persons) {
        const conf = ((p.confidence || 0) * 100).toFixed(0);
        const activity = p.activity || 'unknown';
        personsHtml += `
          <div class="zone-person-row">
            <span class="person-id">${p.person_id || 'Unknown'}</span>
            <span class="person-activity ${activity === 'falling' ? 'danger' : ''}">${activity}</span>
            <span class="person-conf">${conf}%</span>
          </div>
        `;
      }
    }

    detail.innerHTML = `
      <div class="zone-detail-header">
        <h4>${label}</h4>
        <span class="zone-detail-cap">Capacity: ${current}/${maxOccupancy}</span>
      </div>
      <div class="zone-detail-timestamp">Last update: ${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--'}</div>
      <div class="zone-persons-list">${personsHtml}</div>
    `;
  }

  // --- Alert Rules (Enhanced) ---
  async _refreshRules() {
    try {
      const data = await alertService.getRules();
      this._rules = data.rules || [];
      this._renderRules(this._rules);
    } catch (e) {
      this._rules = [];
    }
  }

  _renderRules(rules) {
    const container = this.container.querySelector('#settingsRulesList');
    container.innerHTML = '';

    for (const rule of rules) {
      const el = document.createElement('div');
      el.className = `settings-rule-item ${rule.enabled ? 'enabled' : 'disabled'}`;

      const zonesText = rule.zone_ids.map(z => ROOM_LABELS[z] || z).join(', ');
      const condText = rule.conditions ? Object.entries(rule.conditions).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

      el.innerHTML = `
        <div class="rule-row-main">
          <div class="rule-info">
            <span class="rule-name">${rule.name}</span>
            <span class="alert-badge severity-${rule.severity}">${rule.severity.toUpperCase()}</span>
          </div>
          <div class="rule-controls">
            <label class="rule-toggle">
              <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-rule-id="${rule.id}">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn--sm btn--secondary rule-edit-btn" data-rule-id="${rule.id}">Edit</button>
          </div>
        </div>
        <div class="rule-row-detail">
          <span class="rule-zones-text">Zones: ${zonesText}</span>
          ${condText ? `<span class="rule-cond-text">Conditions: ${condText}</span>` : ''}
        </div>
      `;

      // Toggle handler
      el.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
        await alertService.updateRule(rule.id, { enabled: e.target.checked });
        this._refreshRules();
      });

      // Edit handler
      el.querySelector('.rule-edit-btn').addEventListener('click', () => this._editRule(rule));

      container.appendChild(el);
    }
  }

  _editRule(rule) {
    this._editingRule = rule;
    const editor = this.container.querySelector('#settingsRuleEditor');
    editor.style.display = 'block';

    this.container.querySelector('#ruleEditorTitle').textContent = `Edit: ${rule.name}`;
    this.container.querySelector('#ruleEditSeverity').value = rule.severity;

    // Build zone checkboxes
    const zonesContainer = this.container.querySelector('#ruleEditZones');
    const allZones = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'hallway'];
    zonesContainer.innerHTML = '';
    for (const z of allZones) {
      const label = document.createElement('label');
      label.className = 'zone-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = z;
      cb.checked = rule.zone_ids.includes(z);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + (ROOM_LABELS[z] || z)));
      zonesContainer.appendChild(label);
    }

    this.container.querySelector('#ruleTestResult').style.display = 'none';
  }

  async _saveRule() {
    if (!this._editingRule) return;

    const severity = this.container.querySelector('#ruleEditSeverity').value;
    const checkboxes = this.container.querySelectorAll('#ruleEditZones input[type=checkbox]:checked');
    const zone_ids = Array.from(checkboxes).map(cb => cb.value);

    await alertService.updateRule(this._editingRule.id, { severity, zone_ids });
    this._cancelRuleEdit();
    await this._refreshRules();
  }

  _cancelRuleEdit() {
    this._editingRule = null;
    this.container.querySelector('#settingsRuleEditor').style.display = 'none';
  }

  async _testRule() {
    if (!this._editingRule) return;
    const resultEl = this.container.querySelector('#ruleTestResult');
    resultEl.style.display = 'block';
    resultEl.textContent = 'Testing rule...';
    resultEl.className = 'rule-test-result';

    try {
      // Get current pose data to test against
      const pose = await poseService.getCurrentPose();
      const persons = pose?.persons || [];
      const zoneId = this._editingRule.zone_ids[0] || 'living_room';

      // Use the evaluate endpoint
      const response = await alertService.evaluate ?
        await alertService.evaluate({ zone_id: zoneId, persons }) :
        await fetch(`http://localhost:3010/api/v1/alerts/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone_id: zoneId, persons })
        }).then(r => r.json());

      const triggered = response?.alerts_triggered || response?.alerts || [];
      if (triggered.length > 0) {
        resultEl.textContent = `Rule triggered! ${triggered.length} alert(s) generated.`;
        resultEl.className = 'rule-test-result triggered';
      } else {
        resultEl.textContent = 'Rule did not trigger with current data.';
        resultEl.className = 'rule-test-result not-triggered';
      }
    } catch (e) {
      resultEl.textContent = 'Test failed: ' + e.message;
      resultEl.className = 'rule-test-result error';
    }
  }

  // --- System Metrics (Full) ---
  async _refreshMetrics() {
    try {
      const metrics = await healthService.getSystemMetrics();
      this._renderMetrics(metrics);
    } catch (e) {
      const container = this.container.querySelector('#settingsMetrics');
      container.innerHTML = '<div class="settings-empty">System metrics unavailable</div>';
    }
  }

  _renderMetrics(raw) {
    const container = this.container.querySelector('#settingsMetrics');
    // Backend may wrap in { metrics: {...} }
    const m = raw?.metrics || raw;
    const cpu = m.cpu?.percent || m.cpu_percent || 0;
    const mem = m.memory?.percent || m.memory_percent || 0;
    const memUsedRaw = m.memory?.used || m.memory?.used_gb;
    const memTotalRaw = m.memory?.total || m.memory?.total_gb;
    const memUsed = memUsedRaw ? (memUsedRaw > 1e6 ? this._formatBytes(memUsedRaw) : memUsedRaw.toFixed(1) + ' GB') : '--';
    const memTotal = memTotalRaw ? (memTotalRaw > 1e6 ? this._formatBytes(memTotalRaw) : memTotalRaw.toFixed(1) + ' GB') : '--';
    const disk = m.disk?.percent || m.disk_percent || 0;
    const diskUsedRaw = m.disk?.used || m.disk?.used_gb;
    const diskTotalRaw = m.disk?.total || m.disk?.total_gb;
    const diskUsed = diskUsedRaw ? (diskUsedRaw > 1e6 ? this._formatBytes(diskUsedRaw) : diskUsedRaw.toFixed(1) + ' GB') : '--';
    const diskTotal = diskTotalRaw ? (diskTotalRaw > 1e6 ? this._formatBytes(diskTotalRaw) : diskTotalRaw.toFixed(1) + ' GB') : '--';
    const netSent = m.network?.bytes_sent ? this._formatBytes(m.network.bytes_sent) : '--';
    const netRecv = m.network?.bytes_recv ? this._formatBytes(m.network.bytes_recv) : '--';
    const load = m.load_average || {};
    const proc = m.process || {};

    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card-header">CPU</div>
        <div class="metric-bar-lg"><div class="metric-fill-lg ${cpu > 80 ? 'danger' : cpu > 60 ? 'warn' : ''}" style="width:${cpu}%"></div></div>
        <div class="metric-card-val">${cpu.toFixed(1)}%</div>
        ${m.cpu?.count ? `<div class="metric-card-sub">${m.cpu.count} cores</div>` : ''}
      </div>

      <div class="metric-card">
        <div class="metric-card-header">Memory</div>
        <div class="metric-bar-lg"><div class="metric-fill-lg ${mem > 80 ? 'danger' : mem > 60 ? 'warn' : ''}" style="width:${mem}%"></div></div>
        <div class="metric-card-val">${mem.toFixed(1)}%</div>
        <div class="metric-card-sub">${memUsed} / ${memTotal}</div>
      </div>

      <div class="metric-card">
        <div class="metric-card-header">Disk</div>
        <div class="metric-bar-lg"><div class="metric-fill-lg ${disk > 90 ? 'danger' : disk > 75 ? 'warn' : ''}" style="width:${disk}%"></div></div>
        <div class="metric-card-val">${disk.toFixed(1)}%</div>
        <div class="metric-card-sub">${diskUsed} / ${diskTotal}</div>
      </div>

      <div class="metric-card">
        <div class="metric-card-header">Network I/O</div>
        <div class="metric-card-val net-io">
          <span>Sent: ${netSent}</span>
          <span>Recv: ${netRecv}</span>
        </div>
        ${m.network?.packets_sent ? `<div class="metric-card-sub">${m.network.packets_sent.toLocaleString()} pkts sent / ${(m.network.packets_recv || 0).toLocaleString()} recv</div>` : ''}
      </div>

      ${Object.keys(load).length > 0 ? `
      <div class="metric-card">
        <div class="metric-card-header">Load Average</div>
        <div class="metric-card-val load-avg">
          <span>1m: ${(load['1min'] || load.load_1 || 0).toFixed(2)}</span>
          <span>5m: ${(load['5min'] || load.load_5 || 0).toFixed(2)}</span>
          <span>15m: ${(load['15min'] || load.load_15 || 0).toFixed(2)}</span>
        </div>
      </div>` : ''}

      ${proc.pid ? `
      <div class="metric-card">
        <div class="metric-card-header">Process</div>
        <div class="metric-card-val">PID ${proc.pid}</div>
        <div class="metric-card-sub">${proc.threads || '--'} threads, CPU ${(proc.cpu_percent || 0).toFixed(1)}%, Mem ${proc.memory_mb ? proc.memory_mb.toFixed(0) + 'MB' : '--'}</div>
      </div>` : ''}
    `;
  }

  // --- Connected Clients ---
  async _refreshClients() {
    try {
      const [status, clients] = await Promise.allSettled([
        streamService.getStatus(),
        streamService.getClients(),
      ]);

      if (status.status === 'fulfilled') this._renderStreamStatus(status.value);
      if (clients.status === 'fulfilled') this._renderClients(clients.value);
      else this._renderClients({ clients: [] });
    } catch (e) {
      const container = this.container.querySelector('#settingsClients');
      container.innerHTML = '<div class="settings-empty">Client info unavailable</div>';
    }
  }

  _renderStreamStatus(status) {
    const container = this.container.querySelector('#settingsStreamStatus');
    const active = status.is_active || status.status === 'active';
    container.innerHTML = `
      <div class="stream-info-row">
        <span class="stream-dot ${active ? 'active' : ''}"></span>
        <span>Streaming: ${active ? 'Active' : 'Inactive'}</span>
        <span>Clients: ${status.connected_clients || 0}</span>
        <span>Messages: ${(status.messages_sent || 0).toLocaleString()}</span>
      </div>
    `;
  }

  _renderClients(data) {
    const container = this.container.querySelector('#settingsClients');
    const clients = data.clients || data || [];

    if (!Array.isArray(clients) || clients.length === 0) {
      container.innerHTML = '<div class="settings-empty">No connected clients</div>';
      return;
    }

    container.innerHTML = '';
    for (const client of clients) {
      const el = document.createElement('div');
      el.className = 'client-row';
      el.innerHTML = `
        <span class="client-id">${client.client_id || client.id || 'unknown'}</span>
        <span class="client-type">${client.stream_type || 'pose'}</span>
        <span class="client-connected">${client.connected_at ? new Date(client.connected_at).toLocaleTimeString() : '--'}</span>
        <button class="btn btn--danger btn--sm client-disconnect" data-id="${client.client_id || client.id}">Disconnect</button>
      `;
      el.querySelector('.client-disconnect').addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await streamService.disconnectClient(id);
        this._refreshClients();
      });
      container.appendChild(el);
    }
  }

  // --- Helpers ---
  _formatBytes(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  _startPolling() {
    this._stopPolling();
    this._pollInterval = setInterval(() => this._refreshAll(), 10000);
  }

  _stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  dispose() {
    this._stopPolling();
  }
}
