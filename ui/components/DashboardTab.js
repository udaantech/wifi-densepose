// Dashboard Tab Component — Security-Focused Home Monitoring

import { healthService } from '../services/health.service.js';
import { poseService } from '../services/pose.service.js';
import { alertService } from '../services/alert.service.js';

const ROOM_LABELS = {
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  hallway: 'Hallway',
};

export class DashboardTab {
  constructor(containerElement) {
    this.container = containerElement;
    this.healthSubscription = null;
    this.statsInterval = null;
    this._eventLog = [];
    this._occupancyHistory = [];
    this._maxEvents = 30;
    this._maxHistory = 20;
    this._prevZoneOccupancy = {};
  }

  async init() {
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
        <!-- Room Status Cards -->
        <div class="dash-panel dash-rooms">
          <h3>Room Status</h3>
          <div class="room-cards" id="dashRoomCards">
            <div class="room-empty">No zones -- run Calibration first</div>
          </div>
        </div>

        <!-- Alert Summary -->
        <div class="dash-panel dash-alert-summary">
          <h3>Alert Summary</h3>
          <div class="alert-mini-cards" id="dashAlertMini">
            <div class="alert-mini critical"><span class="mini-count">0</span><span class="mini-label">Critical</span></div>
            <div class="alert-mini warning"><span class="mini-count">0</span><span class="mini-label">Warning</span></div>
            <div class="alert-mini info"><span class="mini-count">0</span><span class="mini-label">Info</span></div>
          </div>
          <div class="recent-alerts" id="dashRecentAlerts">
            <div class="dash-empty">No recent alerts</div>
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

        <!-- Live Event Feed -->
        <div class="dash-panel dash-events">
          <h3>Live Event Feed</h3>
          <div class="event-feed" id="dashEventFeed">
            <div class="dash-empty">Monitoring all rooms...</div>
          </div>
        </div>

        <!-- System Health (compact) -->
        <div class="dash-panel dash-health">
          <h3>System Health</h3>
          <div class="health-items" id="dashHealthItems">
            <div class="health-row"><span>API</span><span class="health-dot" id="healthApi"></span></div>
            <div class="health-row"><span>Hardware</span><span class="health-dot" id="healthHw"></span></div>
            <div class="health-row"><span>Inference</span><span class="health-dot" id="healthInf"></span></div>
            <div class="health-row"><span>Streaming</span><span class="health-dot" id="healthStream"></span></div>
          </div>
          <div class="health-metrics" id="dashMetrics">
            <div class="metric-row"><span>CPU</span><div class="mini-bar"><div class="mini-fill" id="metricCpu"></div></div><span class="metric-val" id="metricCpuVal">0%</span></div>
            <div class="metric-row"><span>Memory</span><div class="mini-bar"><div class="mini-fill" id="metricMem"></div></div><span class="metric-val" id="metricMemVal">0%</span></div>
          </div>
        </div>

        <!-- Occupancy Timeline -->
        <div class="dash-panel dash-timeline">
          <h3>Occupancy Timeline</h3>
          <div class="timeline-chart" id="dashTimeline">
            <div class="dash-empty">Collecting data...</div>
          </div>
        </div>

        <!-- Historical Analytics -->
        <div class="dash-panel dash-analytics" style="grid-column: 1 / -1;">
          <h3>Detection Statistics (24h)</h3>
          <div class="analytics-stats" id="dashAnalyticsStats">
            <div class="dash-empty">Loading analytics...</div>
          </div>
          <div class="analytics-chart" id="dashAnalyticsChart"></div>
        </div>
      </div>
    `;
  }

  async _loadInitialData() {
    try {
      const info = await healthService.getApiInfo();
      this._updateApiInfo(info);
    } catch (e) {
      // silent
    }
  }

  _startMonitoring() {
    this.healthSubscription = healthService.subscribeToHealth(h => this._updateHealth(h));
    this.statsInterval = setInterval(() => this._updateAll(), 3000);
    healthService.startHealthMonitoring(30000);
    this._updateAll();
  }

  async _updateAll() {
    try {
      const [pose, zones, stats, alertSummary, alerts, activities] = await Promise.allSettled([
        poseService.getCurrentPose(),
        poseService.getZonesSummary(),
        poseService.getStats(24),
        alertService.getSummary(),
        alertService.getAlerts({ limit: 5 }),
        this._fetchActivities(),
      ]);

      if (pose.status === 'fulfilled') this._updatePoseStats(pose.value);
      if (zones.status === 'fulfilled') this._updateRoomCards(zones.value);
      if (stats.status === 'fulfilled') this._updateAnalytics(stats.value);
      if (alertSummary.status === 'fulfilled') this._updateAlertSummary(alertSummary.value);
      if (alerts.status === 'fulfilled') this._updateRecentAlerts(alerts.value?.alerts || []);
      if (activities.status === 'fulfilled') this._updateActivityMonitor(activities.value);
      this._trackOccupancy(zones.status === 'fulfilled' ? zones.value : null);
    } catch (e) {
      // silent
    }
  }

  async _fetchActivities() {
    try {
      return await poseService.getActivities();
    } catch (e) { /* silent */ }
    return { activities: [] };
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

    // Generate events from person zone changes
    if (data.persons) {
      for (const p of data.persons) {
        const zid = p.zone_id || 'unknown';
        const activity = p.activity || 'unknown';
        this._addEvent(zid, `Person ${p.person_id || '?'}: ${activity}`, activity);
      }
    }
  }

  _updateAnalytics(data) {
    const stats = data?.statistics || data || {};
    if (stats.total_detections !== undefined) {
      this._setText('dashTotalDetections', this._formatNumber(stats.total_detections));
    }

    const container = this.container.querySelector('#dashAnalyticsStats');
    if (!container) return;

    const total = stats.total_detections || 0;
    const successful = stats.successful_detections || total;
    const failed = stats.failed_detections || 0;
    const avgConf = stats.average_confidence || 0;
    const avgProc = stats.average_processing_time_ms || stats.avg_processing_time || 0;
    const peakPersons = stats.peak_persons || stats.max_persons_detected || 0;
    const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '100.0';

    container.innerHTML = `
      <div class="analytics-row">
        <div class="analytics-item">
          <span class="analytics-val">${this._formatNumber(total)}</span>
          <span class="analytics-label">Total Detections</span>
        </div>
        <div class="analytics-item">
          <span class="analytics-val">${successRate}%</span>
          <span class="analytics-label">Success Rate</span>
        </div>
        <div class="analytics-item">
          <span class="analytics-val">${(avgConf * 100).toFixed(0)}%</span>
          <span class="analytics-label">Avg Confidence</span>
        </div>
        <div class="analytics-item">
          <span class="analytics-val">${avgProc.toFixed(1)}ms</span>
          <span class="analytics-label">Avg Processing</span>
        </div>
        <div class="analytics-item">
          <span class="analytics-val">${peakPersons}</span>
          <span class="analytics-label">Peak Persons</span>
        </div>
        <div class="analytics-item">
          <span class="analytics-val ${failed > 0 ? 'danger' : ''}">${this._formatNumber(failed)}</span>
          <span class="analytics-label">Failed Detections</span>
        </div>
      </div>
    `;

    // Render a simple bar chart of success vs failed
    const chart = this.container.querySelector('#dashAnalyticsChart');
    if (chart && total > 0) {
      const successPct = (successful / total * 100).toFixed(1);
      const failPct = (failed / total * 100).toFixed(1);
      chart.innerHTML = `
        <div class="analytics-bar-chart">
          <div class="analytics-bar-label">Detection Rate</div>
          <div class="analytics-bar-track">
            <div class="analytics-bar-fill success" style="width:${successPct}%" title="Successful: ${successPct}%"></div>
            ${failed > 0 ? `<div class="analytics-bar-fill fail" style="width:${failPct}%" title="Failed: ${failPct}%"></div>` : ''}
          </div>
          <div class="analytics-bar-legend">
            <span class="legend-item"><span class="legend-dot success"></span> Successful ${successPct}%</span>
            ${failed > 0 ? `<span class="legend-item"><span class="legend-dot fail"></span> Failed ${failPct}%</span>` : ''}
          </div>
        </div>
      `;
    }
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

      const name = document.createElement('div');
      name.className = 'room-card-name';
      name.textContent = ROOM_LABELS[zoneId] || zoneId;

      const status = document.createElement('div');
      status.className = 'room-card-status';
      status.textContent = count > 0 ? `${count} person${count > 1 ? 's' : ''}` : 'Empty';

      const dot = document.createElement('div');
      dot.className = `room-card-dot ${count > 0 ? 'active' : ''}`;

      card.appendChild(dot);
      card.appendChild(name);
      card.appendChild(status);
      container.appendChild(card);
    }
  }

  // --- Alert Summary ---
  _updateAlertSummary(summary) {
    if (!summary) return;
    this._setText('dashActiveAlerts', summary.unacknowledged || 0);

    const cards = this.container.querySelectorAll('.alert-mini');
    if (cards[0]) cards[0].querySelector('.mini-count').textContent = summary.by_severity?.critical || 0;
    if (cards[1]) cards[1].querySelector('.mini-count').textContent = summary.by_severity?.warning || 0;
    if (cards[2]) cards[2].querySelector('.mini-count').textContent = summary.by_severity?.info || 0;
  }

  _updateRecentAlerts(alerts) {
    const container = this.container.querySelector('#dashRecentAlerts');
    if (!container) return;

    if (!alerts.length) {
      container.innerHTML = '<div class="dash-empty">No recent alerts</div>';
      return;
    }

    container.innerHTML = '';
    for (const alert of alerts.slice(0, 5)) {
      const el = document.createElement('div');
      el.className = `recent-alert-item severity-${alert.severity}`;

      const badge = document.createElement('span');
      badge.className = `alert-badge severity-${alert.severity}`;
      badge.textContent = alert.severity.charAt(0).toUpperCase();

      const msg = document.createElement('span');
      msg.className = 'recent-alert-msg';
      msg.textContent = alert.title + ' - ' + (ROOM_LABELS[alert.zone_id] || alert.zone_id);

      const time = document.createElement('span');
      time.className = 'recent-alert-time';
      time.textContent = new Date(alert.timestamp).toLocaleTimeString();

      el.appendChild(badge);
      el.appendChild(msg);
      el.appendChild(time);
      container.appendChild(el);
    }
  }

  // --- Activity Monitor ---
  _updateActivityMonitor(data) {
    const activities = data?.activities || [];
    const barsContainer = this.container.querySelector('#dashActivityBars');
    const currentContainer = this.container.querySelector('#dashActivityCurrent');
    if (!barsContainer || !currentContainer) return;

    // Count activities
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

      const label = document.createElement('span');
      label.className = 'activity-label';
      label.textContent = t.charAt(0).toUpperCase() + t.slice(1);

      const bar = document.createElement('div');
      bar.className = 'activity-bar';

      const fill = document.createElement('div');
      fill.className = 'activity-fill';
      fill.style.width = pct + '%';
      fill.style.background = colors[t] || '#999';

      const val = document.createElement('span');
      val.className = 'activity-val';
      val.textContent = pct + '%';

      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(val);
      barsContainer.appendChild(row);
    }

    // Current activities per person
    currentContainer.innerHTML = '';
    const recent = activities.slice(0, 5);
    if (!recent.length) {
      currentContainer.innerHTML = '<div class="dash-empty">No recent activity</div>';
      return;
    }
    for (const a of recent) {
      const el = document.createElement('div');
      el.className = 'activity-current-item';

      const who = document.createElement('span');
      who.className = 'activity-who';
      who.textContent = ROOM_LABELS[a.zone_id] || a.zone_id;

      const what = document.createElement('span');
      what.className = `activity-what ${a.activity === 'falling' ? 'danger' : ''}`;
      what.textContent = a.activity;

      const conf = document.createElement('span');
      conf.className = 'activity-conf';
      conf.textContent = ((a.confidence || 0) * 100).toFixed(0) + '%';

      el.appendChild(who);
      el.appendChild(what);
      el.appendChild(conf);
      currentContainer.appendChild(el);
    }
  }

  // --- Live Event Feed ---
  _addEvent(zoneId, message, activity) {
    const event = {
      time: new Date().toLocaleTimeString(),
      zone: ROOM_LABELS[zoneId] || zoneId,
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
    for (const ev of this._eventLog.slice(0, 10)) {
      const el = document.createElement('div');
      el.className = 'event-item';

      const time = document.createElement('span');
      time.className = 'event-time';
      time.textContent = ev.time;

      const zone = document.createElement('span');
      zone.className = 'event-zone';
      zone.textContent = ev.zone;

      const msg = document.createElement('span');
      msg.className = `event-msg ${ev.activity === 'falling' ? 'danger' : ''}`;
      msg.textContent = ev.message;

      el.appendChild(time);
      el.appendChild(zone);
      el.appendChild(msg);
      feed.appendChild(el);
    }
  }

  // --- Occupancy Timeline ---
  _trackOccupancy(zonesSummary) {
    let zones = {};
    if (zonesSummary?.zones) zones = zonesSummary.zones;
    else if (zonesSummary && typeof zonesSummary === 'object') zones = zonesSummary;

    const entry = { time: new Date().toLocaleTimeString().slice(0, 5), zones: {} };
    for (const [zid, data] of Object.entries(zones)) {
      entry.zones[zid] = typeof data === 'object' ? (data.occupancy || data.person_count || 0) : data;
    }
    this._occupancyHistory.push(entry);
    if (this._occupancyHistory.length > this._maxHistory) this._occupancyHistory.shift();
    this._renderTimeline();
  }

  _renderTimeline() {
    const container = this.container.querySelector('#dashTimeline');
    if (!container || this._occupancyHistory.length < 2) return;

    container.innerHTML = '';
    const table = document.createElement('div');
    table.className = 'timeline-table';

    // Header
    const headerRow = document.createElement('div');
    headerRow.className = 'timeline-row timeline-header';
    const timeLabel = document.createElement('span');
    timeLabel.textContent = 'Time';
    headerRow.appendChild(timeLabel);

    const allZones = new Set();
    this._occupancyHistory.forEach(e => Object.keys(e.zones).forEach(z => allZones.add(z)));
    for (const z of allZones) {
      const zh = document.createElement('span');
      zh.textContent = ROOM_LABELS[z] || z;
      headerRow.appendChild(zh);
    }
    table.appendChild(headerRow);

    // Data rows (most recent first)
    const rows = [...this._occupancyHistory].reverse().slice(0, 10);
    for (const entry of rows) {
      const row = document.createElement('div');
      row.className = 'timeline-row';

      const t = document.createElement('span');
      t.className = 'timeline-time';
      t.textContent = entry.time;
      row.appendChild(t);

      for (const z of allZones) {
        const cell = document.createElement('span');
        const val = entry.zones[z] || 0;
        cell.className = `timeline-cell ${val > 0 ? 'occupied' : ''}`;
        cell.textContent = val;
        row.appendChild(cell);
      }
      table.appendChild(row);
    }

    container.appendChild(table);
  }

  // --- Health ---
  _updateHealth(health) {
    if (!health) return;

    const overallStatus = document.querySelector('.overall-health');
    if (overallStatus) {
      overallStatus.className = `overall-health status-${health.status}`;
      overallStatus.textContent = health.status.toUpperCase();
    }

    if (health.components) {
      const map = { pose: 'healthInf', stream: 'healthStream', hardware: 'healthHw' };
      for (const [comp, status] of Object.entries(health.components)) {
        const id = map[comp];
        if (id) {
          const dot = this.container.querySelector('#' + id);
          if (dot) dot.className = `health-dot ${status.status}`;
        }
      }
      // API dot
      const apiDot = this.container.querySelector('#healthApi');
      if (apiDot) apiDot.className = 'health-dot healthy';
    }

    if (health.metrics) this._updateMetrics(health.metrics);
  }

  _updateMetrics(metrics) {
    const sys = metrics.system_metrics || metrics;
    const cpu = sys.cpu?.percent || sys.cpu_percent || 0;
    const mem = sys.memory?.percent || sys.memory_percent || 0;

    const cpuFill = this.container.querySelector('#metricCpu');
    const memFill = this.container.querySelector('#metricMem');
    if (cpuFill) cpuFill.style.width = cpu.toFixed(0) + '%';
    if (memFill) memFill.style.width = mem.toFixed(0) + '%';
    this._setText('metricCpuVal', cpu.toFixed(0) + '%');
    this._setText('metricMemVal', mem.toFixed(0) + '%');
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
