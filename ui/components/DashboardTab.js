// Dashboard Tab — Security Command Center
// Focused: who's where right now, movement trail, occupancy heatmap

import { healthService } from '../services/health.service.js';
import { poseService } from '../services/pose.service.js';
import { alertService } from '../services/alert.service.js';
import { roomConfigService } from '../services/room-config.service.js';

export class DashboardTab {
  constructor(containerElement) {
    this.container = containerElement;
    this.healthSubscription = null;
    this.statsInterval = null;
    this._eventLog = [];
    this._movementTrail = []; // {time, personId, zone, activity}
    this._occupancyGrid = []; // [{time, zones: {zoneId: count}}]
    this._maxEvents = 30;
    this._maxTrail = 50;
    this._maxGrid = 12; // 12 time slots for heatmap
  }

  async init() {
    await roomConfigService.load();
    this._buildDOM();
    await this._loadInitialData();
    this._startMonitoring();
  }

  _buildDOM() {
    this.container.innerHTML = `
      <!-- Top Stats Bar -->
      <div class="dash-stats-bar">
        <div class="dash-stat-card">
          <span class="dash-stat-value" id="dashPersonCount">0</span>
          <span class="dash-stat-label">People Home</span>
        </div>
        <div class="dash-stat-card">
          <span class="dash-stat-value" id="dashActiveAlerts">0</span>
          <span class="dash-stat-label">Active Alerts</span>
        </div>
        <div class="dash-stat-card">
          <span class="dash-stat-value" id="dashTotalDetections">0</span>
          <span class="dash-stat-label">Detections (24h)</span>
        </div>
        <div class="dash-stat-card">
          <span class="dash-stat-value" id="dashConfidence">0%</span>
          <span class="dash-stat-label">Avg Confidence</span>
        </div>
      </div>

      <!-- Main Grid -->
      <div class="dash-grid">
        <!-- Room Status Cards (full width) -->
        <div class="dash-panel dash-rooms" style="grid-column: 1 / -1;">
          <h3>Room Status</h3>
          <div class="room-cards" id="dashRoomCards">
            <div class="room-empty">No zones -- run Calibration first</div>
          </div>
        </div>

        <!-- Movement Trail -->
        <div class="dash-panel dash-trail">
          <h3>Movement Trail</h3>
          <div class="movement-trail" id="dashMovementTrail">
            <div class="dash-empty">Tracking movement...</div>
          </div>
        </div>

        <!-- Activity Monitor -->
        <div class="dash-panel dash-activity">
          <h3>Activity Monitor</h3>
          <div class="activity-bars" id="dashActivityBars"></div>
          <div class="activity-current" id="dashActivityCurrent">
            <div class="dash-empty">Waiting for data...</div>
          </div>
        </div>

        <!-- Occupancy Heatmap (full width) -->
        <div class="dash-panel dash-heatmap" style="grid-column: 1 / -1;">
          <h3>Occupancy Heatmap (Last Hour)</h3>
          <div class="heatmap-grid" id="dashHeatmap">
            <div class="dash-empty">Collecting data...</div>
          </div>
        </div>

        <!-- Live Event Feed -->
        <div class="dash-panel dash-events" style="grid-column: 1 / -1;">
          <h3>Live Event Feed</h3>
          <div class="event-feed" id="dashEventFeed">
            <div class="dash-empty">Monitoring all rooms...</div>
          </div>
        </div>
      </div>
    `;
  }

  async _loadInitialData() {
    try {
      const info = await healthService.getApiInfo();
      this._updateApiInfo(info);
    } catch (e) { /* silent */ }
  }

  _startMonitoring() {
    this.healthSubscription = healthService.subscribeToHealth(h => this._updateHealth(h));
    this.statsInterval = setInterval(() => this._updateAll(), 3000);
    healthService.startHealthMonitoring(30000);
    this._updateAll();
  }

  async _updateAll() {
    try {
      const [pose, zones, stats, alertSummary, activities] = await Promise.allSettled([
        poseService.getCurrentPose(),
        poseService.getZonesSummary(),
        poseService.getStats(24),
        alertService.getSummary(),
        this._fetchActivities(),
      ]);

      if (pose.status === 'fulfilled') this._updatePoseStats(pose.value);
      if (zones.status === 'fulfilled') this._updateRoomCards(zones.value);
      if (stats.status === 'fulfilled') this._updateDetectionCount(stats.value);
      if (alertSummary.status === 'fulfilled') this._updateAlertCount(alertSummary.value);
      if (activities.status === 'fulfilled') this._updateActivityMonitor(activities.value);
      this._trackOccupancy(zones.status === 'fulfilled' ? zones.value : null);
    } catch (e) { /* silent */ }
  }

  async _fetchActivities() {
    try { return await poseService.getActivities(); }
    catch (e) { return { activities: [] }; }
  }

  // --- Top Stats ---
  _updatePoseStats(data) {
    if (!data) return;
    const count = data.persons ? data.persons.length : 0;
    this._setText('dashPersonCount', count);

    if (data.persons && data.persons.length > 0) {
      const avg = data.persons.reduce((s, p) => s + (p.confidence || 0), 0) / data.persons.length;
      this._setText('dashConfidence', (avg * 100).toFixed(0) + '%');
    }

    // Track movement + generate events
    if (data.persons) {
      for (const p of data.persons) {
        const zid = p.zone_id || 'unknown';
        const activity = p.activity || 'unknown';
        const pid = p.person_id || '?';
        this._trackMovement(pid, zid, activity);
        this._addEvent(zid, `Person ${pid}: ${activity}`, activity);
      }
    }
  }

  _updateDetectionCount(data) {
    const stats = data?.statistics || data || {};
    if (stats.total_detections !== undefined) {
      this._setText('dashTotalDetections', this._formatNumber(stats.total_detections));
    }
  }

  _updateAlertCount(summary) {
    if (!summary) return;
    this._setText('dashActiveAlerts', summary.unacknowledged || 0);
  }

  // --- Room Cards ---
  _updateRoomCards(zonesSummary) {
    const container = this.container.querySelector('#dashRoomCards');
    if (!container) return;

    let zones = {};
    if (zonesSummary?.zones) zones = zonesSummary.zones;
    else if (zonesSummary && typeof zonesSummary === 'object') zones = zonesSummary;

    if (Object.keys(zones).length === 0) {
      container.innerHTML = '<div class="room-empty">No zones -- run Calibration first</div>';
      return;
    }

    container.innerHTML = '';
    for (const [zoneId, data] of Object.entries(zones)) {
      const count = typeof data === 'object' ? (data.occupancy || data.person_count || data.count || 0) : data;
      const card = document.createElement('div');
      card.className = `room-card ${count > 0 ? 'occupied' : 'empty'}`;

      const dot = document.createElement('div');
      dot.className = `room-card-dot ${count > 0 ? 'active' : ''}`;

      const name = document.createElement('div');
      name.className = 'room-card-name';
      name.textContent = roomConfigService.getLabel(zoneId);

      const status = document.createElement('div');
      status.className = 'room-card-status';
      status.textContent = count > 0 ? `${count} person${count > 1 ? 's' : ''}` : 'Empty';

      card.appendChild(dot);
      card.appendChild(name);
      card.appendChild(status);
      container.appendChild(card);
    }
  }

  // --- Movement Trail ---
  _trackMovement(personId, zoneId, activity) {
    const last = this._movementTrail.find(m => m.personId === personId);
    // Only add if zone changed or no previous entry
    if (!last || last.zone !== zoneId) {
      this._movementTrail.unshift({
        time: new Date().toLocaleTimeString(),
        personId,
        zone: zoneId,
        from: last?.zone || null,
        activity,
      });
      if (this._movementTrail.length > this._maxTrail) this._movementTrail.pop();
      this._renderMovementTrail();
    }
  }

  _renderMovementTrail() {
    const container = this.container.querySelector('#dashMovementTrail');
    if (!container) return;

    const trails = this._movementTrail.slice(0, 10);
    if (!trails.length) {
      container.innerHTML = '<div class="dash-empty">No movement detected yet</div>';
      return;
    }

    container.innerHTML = '';
    for (const m of trails) {
      const el = document.createElement('div');
      el.className = 'trail-item';

      const time = document.createElement('span');
      time.className = 'trail-time';
      time.textContent = m.time;

      const person = document.createElement('span');
      person.className = 'trail-person';
      person.textContent = `Person ${m.personId}`;

      const path = document.createElement('span');
      path.className = 'trail-path';
      if (m.from) {
        path.innerHTML = `<span class="trail-from">${roomConfigService.getLabel(m.from)}</span> <span class="trail-arrow">&rarr;</span> <span class="trail-to">${roomConfigService.getLabel(m.zone)}</span>`;
      } else {
        path.innerHTML = `<span class="trail-to">appeared in ${roomConfigService.getLabel(m.zone)}</span>`;
      }

      const act = document.createElement('span');
      act.className = `trail-activity ${m.activity === 'falling' ? 'danger' : ''}`;
      act.textContent = m.activity;

      el.appendChild(time);
      el.appendChild(person);
      el.appendChild(path);
      el.appendChild(act);
      container.appendChild(el);
    }
  }

  // --- Activity Monitor ---
  _updateActivityMonitor(data) {
    const activities = data?.activities || [];
    const barsContainer = this.container.querySelector('#dashActivityBars');
    const currentContainer = this.container.querySelector('#dashActivityCurrent');
    if (!barsContainer || !currentContainer) return;

    const counts = {};
    for (const a of activities) {
      counts[a.activity] = (counts[a.activity] || 0) + 1;
    }

    const total = activities.length || 1;
    const types = ['standing', 'sitting', 'walking', 'lying', 'running', 'falling'];
    const colors = { standing: '#21808d', sitting: '#5e9ca0', walking: '#3da35d', lying: '#6c757d', running: '#e6a817', falling: '#c0152f' };

    barsContainer.innerHTML = '';
    for (const t of types) {
      const pct = ((counts[t] || 0) / total * 100).toFixed(0);
      if (pct == 0) continue;
      const row = document.createElement('div');
      row.className = 'activity-bar-row';
      row.innerHTML = `
        <span class="activity-label">${t.charAt(0).toUpperCase() + t.slice(1)}</span>
        <div class="activity-bar"><div class="activity-fill" style="width:${pct}%;background:${colors[t] || '#999'}"></div></div>
        <span class="activity-val">${pct}%</span>
      `;
      barsContainer.appendChild(row);
    }

    currentContainer.innerHTML = '';
    const recent = activities.slice(0, 5);
    if (!recent.length) {
      currentContainer.innerHTML = '<div class="dash-empty">No recent activity</div>';
      return;
    }
    for (const a of recent) {
      const el = document.createElement('div');
      el.className = 'activity-current-item';
      el.innerHTML = `
        <span class="activity-who">${roomConfigService.getLabel(a.zone_id)}</span>
        <span class="activity-what ${a.activity === 'falling' ? 'danger' : ''}">${a.activity}</span>
        <span class="activity-conf">${((a.confidence || 0) * 100).toFixed(0)}%</span>
      `;
      currentContainer.appendChild(el);
    }
  }

  // --- Occupancy Heatmap ---
  _trackOccupancy(zonesSummary) {
    let zones = {};
    if (zonesSummary?.zones) zones = zonesSummary.zones;
    else if (zonesSummary && typeof zonesSummary === 'object') zones = zonesSummary;

    const entry = { time: new Date().toLocaleTimeString().slice(0, 5), zones: {} };
    for (const [zid, data] of Object.entries(zones)) {
      entry.zones[zid] = typeof data === 'object' ? (data.occupancy || data.person_count || 0) : data;
    }
    this._occupancyGrid.push(entry);
    if (this._occupancyGrid.length > this._maxGrid) this._occupancyGrid.shift();
    this._renderHeatmap();
  }

  _renderHeatmap() {
    const container = this.container.querySelector('#dashHeatmap');
    if (!container || this._occupancyGrid.length < 2) return;

    const zoneIds = [...new Set(this._occupancyGrid.flatMap(e => Object.keys(e.zones)))];
    // Sort by ROOM_ORDER
    const order = roomConfigService.order;
    zoneIds.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    let html = '<div class="hm-table">';
    // Header row: time labels
    html += '<div class="hm-row hm-header"><span class="hm-label"></span>';
    for (const entry of this._occupancyGrid) {
      html += `<span class="hm-time">${entry.time}</span>`;
    }
    html += '</div>';

    // Zone rows
    for (const zid of zoneIds) {
      html += `<div class="hm-row"><span class="hm-label">${roomConfigService.getLabel(zid)}</span>`;
      for (const entry of this._occupancyGrid) {
        const val = entry.zones[zid] || 0;
        const intensity = Math.min(val, 4); // cap at 4 for color scale
        html += `<span class="hm-cell hm-level-${intensity}" title="${val} person${val !== 1 ? 's' : ''}">${val}</span>`;
      }
      html += '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
  }

  // --- Live Event Feed ---
  _addEvent(zoneId, message, activity) {
    const event = {
      time: new Date().toLocaleTimeString(),
      zone: roomConfigService.getLabel(zoneId),
      message,
      activity,
    };
    this._eventLog.unshift(event);
    if (this._eventLog.length > this._maxEvents) this._eventLog.pop();
    this._renderEvents();
  }

  _renderEvents() {
    const feed = this.container.querySelector('#dashEventFeed');
    if (!feed) return;

    feed.innerHTML = '';
    for (const ev of this._eventLog.slice(0, 8)) {
      const el = document.createElement('div');
      el.className = 'event-item';
      el.innerHTML = `
        <span class="event-time">${ev.time}</span>
        <span class="event-zone">${ev.zone}</span>
        <span class="event-msg ${ev.activity === 'falling' ? 'danger' : ''}">${ev.message}</span>
      `;
      feed.appendChild(el);
    }
  }

  // --- Health (header only) ---
  _updateHealth(health) {
    if (!health) return;
    const overallStatus = document.querySelector('.overall-health');
    if (overallStatus) {
      overallStatus.className = `overall-health status-${health.status}`;
      overallStatus.textContent = health.status.toUpperCase();
    }
  }

  _updateApiInfo(info) {
    const versionEl = document.querySelector('.api-version');
    if (versionEl && info.version) versionEl.textContent = `v${info.version}`;
    const envEl = document.querySelector('.api-environment');
    if (envEl && info.environment) {
      envEl.textContent = info.environment;
      envEl.className = `api-environment env-${info.environment}`;
    }
  }

  // --- Helpers ---
  _setText(id, value) {
    const el = this.container.querySelector('#' + id);
    if (el) el.textContent = String(value);
  }

  _formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  dispose() {
    if (this.healthSubscription) this.healthSubscription();
    if (this.statsInterval) clearInterval(this.statsInterval);
    healthService.stopHealthMonitoring();
  }
}
