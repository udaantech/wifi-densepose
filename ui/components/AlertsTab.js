// Security Alerts Tab Component

import { alertService } from '../services/alert.service.js';

export class AlertsTab {
  constructor(container) {
    this.container = container;
    this._pollInterval = null;
    this._currentFilter = { severity: null, zone_id: null, acknowledged: null };
  }

  async init() {
    this._buildDOM();
    this._bindEvents();
    await this._refresh();
    this._startPolling();
  }

  _buildDOM() {
    this.container.innerHTML = `
      <h2>Security Alerts</h2>

      <!-- Summary Cards -->
      <div class="alerts-summary">
        <div class="alert-summary-card critical">
          <span class="summary-count" id="alertCriticalCount">0</span>
          <span class="summary-label">Critical</span>
        </div>
        <div class="alert-summary-card warning">
          <span class="summary-count" id="alertWarningCount">0</span>
          <span class="summary-label">Warning</span>
        </div>
        <div class="alert-summary-card info">
          <span class="summary-count" id="alertInfoCount">0</span>
          <span class="summary-label">Info</span>
        </div>
        <div class="alert-summary-card total">
          <span class="summary-count" id="alertUnackCount">0</span>
          <span class="summary-label">Unacknowledged</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="alerts-controls">
        <div class="alerts-filters">
          <select id="alertSeverityFilter" class="alert-select">
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select id="alertZoneFilter" class="alert-select">
            <option value="">All Zones</option>
            <option value="living_room">Living Room</option>
            <option value="bedroom">Bedroom</option>
            <option value="kitchen">Kitchen</option>
            <option value="bathroom">Bathroom</option>
            <option value="hallway">Hallway</option>
          </select>
          <select id="alertAckFilter" class="alert-select">
            <option value="">All Status</option>
            <option value="false">Active</option>
            <option value="true">Acknowledged</option>
          </select>
        </div>
        <div class="alerts-actions">
          <button id="btnAckAll" class="btn btn--secondary btn--sm">Acknowledge All</button>
          <button id="btnClearAlerts" class="btn btn--danger btn--sm">Clear All</button>
          <button id="btnRefreshAlerts" class="btn btn--primary btn--sm">Refresh</button>
        </div>
      </div>

      <!-- Alert Feed -->
      <div class="alerts-feed" id="alertsFeed">
        <div class="alerts-empty">No alerts yet. The system is monitoring all rooms.</div>
      </div>

      <!-- Alert Rules -->
      <div class="alerts-rules-section">
        <h3>Alert Rules</h3>
        <div class="alerts-rules" id="alertRules"></div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#alertSeverityFilter').addEventListener('change', (e) => {
      this._currentFilter.severity = e.target.value || null;
      this._refreshAlerts();
    });
    this.container.querySelector('#alertZoneFilter').addEventListener('change', (e) => {
      this._currentFilter.zone_id = e.target.value || null;
      this._refreshAlerts();
    });
    this.container.querySelector('#alertAckFilter').addEventListener('change', (e) => {
      const val = e.target.value;
      this._currentFilter.acknowledged = val === '' ? null : val === 'true';
      this._refreshAlerts();
    });
    this.container.querySelector('#btnAckAll').addEventListener('click', async () => {
      await alertService.acknowledgeAll();
      this._refresh();
    });
    this.container.querySelector('#btnClearAlerts').addEventListener('click', async () => {
      await alertService.clearAlerts();
      this._refresh();
    });
    this.container.querySelector('#btnRefreshAlerts').addEventListener('click', () => {
      this._refresh();
    });
  }

  async _refresh() {
    await Promise.all([this._refreshSummary(), this._refreshAlerts(), this._refreshRules()]);
  }

  async _refreshSummary() {
    try {
      const summary = await alertService.getSummary();
      this._setText('alertCriticalCount', summary.by_severity?.critical || 0);
      this._setText('alertWarningCount', summary.by_severity?.warning || 0);
      this._setText('alertInfoCount', summary.by_severity?.info || 0);
      this._setText('alertUnackCount', summary.unacknowledged || 0);
    } catch (e) {
      // API may not be ready
    }
  }

  async _refreshAlerts() {
    try {
      const params = { limit: 50 };
      if (this._currentFilter.severity) params.severity = this._currentFilter.severity;
      if (this._currentFilter.zone_id) params.zone_id = this._currentFilter.zone_id;
      if (this._currentFilter.acknowledged !== null) params.acknowledged = this._currentFilter.acknowledged;

      const data = await alertService.getAlerts(params);
      this._renderAlerts(data.alerts || []);
    } catch (e) {
      // silent
    }
  }

  _renderAlerts(alerts) {
    const feed = this.container.querySelector('#alertsFeed');
    if (!alerts.length) {
      feed.innerHTML = '<div class="alerts-empty">No alerts match the current filters.</div>';
      return;
    }

    feed.innerHTML = '';
    for (const alert of alerts) {
      const el = document.createElement('div');
      el.className = `alert-item severity-${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`;

      const time = new Date(alert.timestamp).toLocaleTimeString();
      const date = new Date(alert.timestamp).toLocaleDateString();

      const header = document.createElement('div');
      header.className = 'alert-item-header';

      const badge = document.createElement('span');
      badge.className = `alert-badge severity-${alert.severity}`;
      badge.textContent = alert.severity.toUpperCase();

      const title = document.createElement('span');
      title.className = 'alert-item-title';
      title.textContent = alert.title;

      const zone = document.createElement('span');
      zone.className = 'alert-item-zone';
      zone.textContent = alert.zone_id.replace(/_/g, ' ');

      const ts = document.createElement('span');
      ts.className = 'alert-item-time';
      ts.textContent = `${date} ${time}`;

      header.appendChild(badge);
      header.appendChild(title);
      header.appendChild(zone);
      header.appendChild(ts);

      const body = document.createElement('div');
      body.className = 'alert-item-body';
      body.textContent = alert.message;

      const actions = document.createElement('div');
      actions.className = 'alert-item-actions';

      if (!alert.acknowledged) {
        const ackBtn = document.createElement('button');
        ackBtn.className = 'btn btn--sm btn--secondary';
        ackBtn.textContent = 'Acknowledge';
        ackBtn.addEventListener('click', async () => {
          await alertService.acknowledge(alert.id);
          this._refresh();
        });
        actions.appendChild(ackBtn);
      } else {
        const ackLabel = document.createElement('span');
        ackLabel.className = 'alert-ack-label';
        ackLabel.textContent = 'Acknowledged';
        actions.appendChild(ackLabel);
      }

      el.appendChild(header);
      el.appendChild(body);
      el.appendChild(actions);
      feed.appendChild(el);
    }
  }

  async _refreshRules() {
    try {
      const data = await alertService.getRules();
      this._renderRules(data.rules || []);
    } catch (e) {
      // silent
    }
  }

  _renderRules(rules) {
    const container = this.container.querySelector('#alertRules');
    container.innerHTML = '';

    for (const rule of rules) {
      const el = document.createElement('div');
      el.className = `rule-item ${rule.enabled ? 'enabled' : 'disabled'}`;

      const header = document.createElement('div');
      header.className = 'rule-header';

      const name = document.createElement('span');
      name.className = 'rule-name';
      name.textContent = rule.name;

      const severity = document.createElement('span');
      severity.className = `alert-badge severity-${rule.severity}`;
      severity.textContent = rule.severity.toUpperCase();

      const toggle = document.createElement('label');
      toggle.className = 'rule-toggle';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = rule.enabled;
      checkbox.addEventListener('change', async () => {
        await alertService.updateRule(rule.id, { enabled: checkbox.checked });
        this._refreshRules();
      });

      const slider = document.createElement('span');
      slider.className = 'toggle-slider';

      toggle.appendChild(checkbox);
      toggle.appendChild(slider);

      header.appendChild(name);
      header.appendChild(severity);
      header.appendChild(toggle);

      const details = document.createElement('div');
      details.className = 'rule-details';

      const zones = document.createElement('span');
      zones.className = 'rule-zones';
      zones.textContent = 'Zones: ' + rule.zone_ids.map(z => z.replace(/_/g, ' ')).join(', ');

      const type = document.createElement('span');
      type.className = 'rule-type';
      type.textContent = 'Type: ' + rule.alert_type.replace(/_/g, ' ');

      details.appendChild(zones);
      details.appendChild(type);

      el.appendChild(header);
      el.appendChild(details);
      container.appendChild(el);
    }
  }

  _setText(id, value) {
    const el = this.container.querySelector('#' + id);
    if (el) el.textContent = String(value);
  }

  _startPolling() {
    this._stopPolling();
    this._pollInterval = setInterval(() => this._refresh(), 5000);
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
