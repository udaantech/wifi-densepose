// Settings Tab — Zone Management, System Metrics, Stream Clients, WiFi Diagnostics

import { poseService } from '../services/pose.service.js';
import { healthService } from '../services/health.service.js';
import { streamService } from '../services/stream.service.js';
import { sensingService } from '../services/sensing.service.js';
import { roomConfigService } from '../services/room-config.service.js';

export class SettingsTab {
  constructor(container) {
    this.container = container;
    this._pollInterval = null;
    this._zoneData = {};
    this._selectedZone = null;
    this._unsubSensing = null;
    this._unsubSensingState = null;
  }

  async init() {
    await roomConfigService.load();
    this._buildDOM();
    this._bindEvents();
    await this._refreshAll();
    this._startPolling();
    this._connectSensing();
  }

  _buildDOM() {
    this.container.innerHTML = `
      <h2>Settings</h2>

      <div class="settings-grid">
        <!-- Zone Management -->
        <div class="settings-panel settings-zones">
          <div class="zone-mgmt-header">
            <h3>Zone Management</h3>
            <div class="zone-mgmt-actions">
              <button class="btn btn--primary btn--sm" id="settingsAddRoom">+ Add Room</button>
            </div>
          </div>
          <div class="zone-list" id="settingsZoneList">
            <div class="settings-empty">Loading zones...</div>
          </div>
          <div class="zone-detail" id="settingsZoneDetail">
            <div class="settings-empty">Select a zone to view details</div>
          </div>
          <!-- Add Room Form (hidden by default) -->
          <div class="zone-add-form" id="settingsAddRoomForm" style="display:none;">
            <h4>Add New Room</h4>
            <div class="form-row">
              <label>Name</label>
              <input type="text" id="addRoomName" placeholder="e.g. Guest Room" />
            </div>
            <div class="form-row">
              <label>Type</label>
              <select id="addRoomType">
                <option value="room">Room</option>
                <option value="bedroom">Bedroom</option>
                <option value="living_room">Living Room / Hall</option>
                <option value="kitchen">Kitchen</option>
                <option value="bathroom">Bathroom</option>
                <option value="hallway">Hallway</option>
                <option value="office">Office</option>
                <option value="entrance">Entrance</option>
              </select>
            </div>
            <div class="form-row">
              <label>Width (m)</label>
              <input type="number" id="addRoomWidth" value="4" min="1" max="20" step="0.5" />
            </div>
            <div class="form-row">
              <label>Length (m)</label>
              <input type="number" id="addRoomLength" value="4" min="1" max="20" step="0.5" />
            </div>
            <div class="form-row">
              <label>Max Persons</label>
              <input type="number" id="addRoomMaxPersons" value="5" min="1" max="20" />
            </div>
            <div class="form-row form-actions">
              <button class="btn btn--primary btn--sm" id="addRoomSubmit">Add</button>
              <button class="btn btn--secondary btn--sm" id="addRoomCancel">Cancel</button>
            </div>
          </div>
        </div>

        <!-- WiFi Diagnostics (from Sensing) -->
        <div class="settings-panel settings-diagnostics">
          <h3>WiFi Diagnostics</h3>
          <div class="diag-connection">
            <span class="sensing-dot" id="diagSensingDot"></span>
            <span id="diagSensingState">Disconnected</span>
            <span class="diag-source" id="diagSensingSource"></span>
          </div>
          <div class="diag-metrics">
            <div class="diag-row">
              <span>RSSI</span><span id="diagRssi">-- dBm</span>
            </div>
            <div class="diag-row">
              <span>Variance</span>
              <div class="diag-bar"><div class="diag-bar-fill" id="diagBarVariance"></div></div>
              <span class="diag-val" id="diagValVariance">0</span>
            </div>
            <div class="diag-row">
              <span>Motion Band</span>
              <div class="diag-bar"><div class="diag-bar-fill motion" id="diagBarMotion"></div></div>
              <span class="diag-val" id="diagValMotion">0</span>
            </div>
            <div class="diag-row">
              <span>Breathing Band</span>
              <div class="diag-bar"><div class="diag-bar-fill breath" id="diagBarBreath"></div></div>
              <span class="diag-val" id="diagValBreath">0</span>
            </div>
            <div class="diag-row">
              <span>Classification</span>
              <span id="diagClassLabel" class="diag-class-label">ABSENT</span>
            </div>
            <div class="diag-row">
              <span>Dominant Freq</span><span id="diagDomFreq">0 Hz</span>
            </div>
            <div class="diag-row">
              <span>Sample Rate</span><span id="diagSampleRate">--</span>
            </div>
          </div>
        </div>

        <!-- System Metrics -->
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
    this.container.querySelector('#settingsAddRoom').addEventListener('click', () => this._showAddRoomForm());
    this.container.querySelector('#addRoomCancel').addEventListener('click', () => this._hideAddRoomForm());
    this.container.querySelector('#addRoomSubmit').addEventListener('click', () => this._submitAddRoom());
  }

  async _refreshAll() {
    await Promise.allSettled([
      this._refreshZones(),
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
        <span class="zone-name">${roomConfigService.getLabel(zoneId)}</span>
        <span class="zone-count">${count} person${count !== 1 ? 's' : ''}</span>
        <button class="btn btn--danger btn--xs zone-remove" title="Remove room">✕</button>
      `;
      el.querySelector('.zone-name').addEventListener('click', () => this._selectZone(zoneId));
      el.querySelector('.zone-remove').addEventListener('click', (e) => { e.stopPropagation(); this._removeRoom(zoneId); });
      container.appendChild(el);
    }
  }

  async _selectZone(zoneId) {
    this._selectedZone = zoneId;
    this._renderZoneList(this._zoneData);

    const detail = this.container.querySelector('#settingsZoneDetail');
    detail.innerHTML = '<div class="settings-empty">Loading zone details...</div>';

    try {
      const data = await poseService.getZoneOccupancy(zoneId);
      this._renderZoneDetail(zoneId, data);
    } catch (e) {
      detail.innerHTML = `<div class="settings-empty">Could not load details for ${roomConfigService.getLabel(zoneId)}</div>`;
    }
  }

  _renderZoneDetail(zoneId, data) {
    const detail = this.container.querySelector('#settingsZoneDetail');
    const label = roomConfigService.getLabel(zoneId);
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

  // --- WiFi Diagnostics ---
  _connectSensing() {
    sensingService.start();
    this._unsubSensing = sensingService.onData((data) => this._onSensingData(data));
    this._unsubSensingState = sensingService.onStateChange((state) => this._onSensingState(state));
  }

  _onSensingState(state) {
    const dot = this.container.querySelector('#diagSensingDot');
    const text = this.container.querySelector('#diagSensingState');
    if (!dot || !text) return;

    const labels = {
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      connected: 'Connected',
      simulated: 'Simulated',
    };

    dot.className = 'sensing-dot ' + state;
    text.textContent = labels[state] || state;
  }

  _onSensingData(data) {
    const f = data.features || {};
    const c = data.classification || {};

    this._setDiagText('diagRssi', `${(f.mean_rssi || -80).toFixed(1)} dBm`);
    this._setDiagText('diagSensingSource', data.source || '');

    this._setDiagBar('diagBarVariance', f.variance, 10, 'diagValVariance', f.variance);
    this._setDiagBar('diagBarMotion', f.motion_band_power, 0.5, 'diagValMotion', f.motion_band_power);
    this._setDiagBar('diagBarBreath', f.breathing_band_power, 0.3, 'diagValBreath', f.breathing_band_power);

    const label = this.container.querySelector('#diagClassLabel');
    if (label) {
      const level = (c.motion_level || 'absent').toUpperCase();
      label.textContent = level;
      label.className = 'diag-class-label ' + (c.motion_level || 'absent');
    }

    this._setDiagText('diagDomFreq', (f.dominant_freq_hz || 0).toFixed(3) + ' Hz');
    this._setDiagText('diagSampleRate', data.source === 'simulated' ? 'sim' : 'live');
  }

  _setDiagText(id, text) {
    const el = this.container.querySelector('#' + id);
    if (el) el.textContent = text;
  }

  _setDiagBar(barId, value, maxVal, valId, displayVal) {
    const bar = this.container.querySelector('#' + barId);
    if (bar) {
      const pct = Math.min(100, Math.max(0, ((value || 0) / maxVal) * 100));
      bar.style.width = pct + '%';
    }
    if (valId && displayVal != null) {
      const el = this.container.querySelector('#' + valId);
      if (el) el.textContent = typeof displayVal === 'number' ? displayVal.toFixed(3) : displayVal;
    }
  }

  // --- System Metrics ---
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

  // --- Room Add/Remove ---
  _showAddRoomForm() {
    this.container.querySelector('#settingsAddRoomForm').style.display = '';
  }

  _hideAddRoomForm() {
    this.container.querySelector('#settingsAddRoomForm').style.display = 'none';
  }

  async _submitAddRoom() {
    const name = this.container.querySelector('#addRoomName').value.trim();
    if (!name) return;

    const zoneType = this.container.querySelector('#addRoomType').value;
    const width = parseFloat(this.container.querySelector('#addRoomWidth').value) || 4;
    const length = parseFloat(this.container.querySelector('#addRoomLength').value) || 4;
    const maxPersons = parseInt(this.container.querySelector('#addRoomMaxPersons').value) || 5;
    const zoneId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');

    try {
      await poseService.addZone({
        zone_id: zoneId,
        name,
        zone_type: zoneType,
        description: `${name} (${(width * length).toFixed(0)}m²)`,
        x_max: width,
        y_max: length,
        max_persons: maxPersons,
      });
      this._hideAddRoomForm();
      this.container.querySelector('#addRoomName').value = '';
      await roomConfigService.load(true);
      await this._refreshZones();
    } catch (e) {
      console.error('Failed to add room:', e);
    }
  }

  async _removeRoom(zoneId) {
    if (!confirm(`Remove "${roomConfigService.getLabel(zoneId)}"? This cannot be undone.`)) return;
    try {
      await poseService.removeZone(zoneId);
      if (this._selectedZone === zoneId) this._selectedZone = null;
      await roomConfigService.load(true);
      await this._refreshZones();
    } catch (e) {
      console.error('Failed to remove room:', e);
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
    if (this._unsubSensing) this._unsubSensing();
    if (this._unsubSensingState) this._unsubSensingState();
    sensingService.stop();
  }
}
