// Security Alerts Tab — Full alert management + rule editor

import { alertService } from '../services/alert.service.js';
import { poseService } from '../services/pose.service.js';
import { roomConfigService } from '../services/room-config.service.js';

export class AlertsTab {
  constructor(container) {
    this.container = container;
    this._pollInterval = null;
    this._currentFilter = { severity: null, zone_id: null, acknowledged: null };
    this._rules = [];
    this._editingRule = null;
  }

  async init() {
    await roomConfigService.load();
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

      <!-- Alert Rules Configuration -->
      <div class="alerts-rules-section">
        <h3>Alert Rules Configuration</h3>
        <div class="alerts-rules" id="alertRules"></div>

        <!-- Rule Editor (hidden by default) -->
        <div class="rule-editor" id="alertRuleEditor" style="display:none;">
          <h4 id="ruleEditorTitle">Edit Rule</h4>
          <div class="rule-form">
            <div class="form-row">
              <label>Severity</label>
              <select id="ruleEditSeverity" class="alert-select">
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

    // Rule editor buttons
    this.container.querySelector('#ruleEditSave').addEventListener('click', () => this._saveRule());
    this.container.querySelector('#ruleEditCancel').addEventListener('click', () => this._cancelRuleEdit());
    this.container.querySelector('#ruleEditTest').addEventListener('click', () => this._testRule());

    // Populate zone filter dropdown dynamically
    this._populateZoneFilter();
  }

  _populateZoneFilter() {
    const select = this.container.querySelector('#alertZoneFilter');
    if (!select) return;
    while (select.options.length > 1) select.remove(1);
    for (const zoneId of roomConfigService.order) {
      const opt = document.createElement('option');
      opt.value = zoneId;
      opt.textContent = roomConfigService.getLabel(zoneId);
      select.appendChild(opt);
    }
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
      zone.textContent = roomConfigService.getLabel(alert.zone_id);

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

  // --- Alert Rules ---

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
    const container = this.container.querySelector('#alertRules');
    container.innerHTML = '';

    for (const rule of rules) {
      const el = document.createElement('div');
      el.className = `rule-item ${rule.enabled ? 'enabled' : 'disabled'}`;

      const zonesText = rule.zone_ids.map(z => roomConfigService.getLabel(z)).join(', ');
      const condText = rule.conditions ? Object.entries(rule.conditions).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

      const header = document.createElement('div');
      header.className = 'rule-header';

      const info = document.createElement('div');
      info.className = 'rule-info';

      const name = document.createElement('span');
      name.className = 'rule-name';
      name.textContent = rule.name;

      const severity = document.createElement('span');
      severity.className = `alert-badge severity-${rule.severity}`;
      severity.textContent = rule.severity.toUpperCase();

      info.appendChild(name);
      info.appendChild(severity);

      const controls = document.createElement('div');
      controls.className = 'rule-controls';

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

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--sm btn--secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => this._editRule(rule));

      controls.appendChild(toggle);
      controls.appendChild(editBtn);

      header.appendChild(info);
      header.appendChild(controls);

      const details = document.createElement('div');
      details.className = 'rule-details';

      const zones = document.createElement('span');
      zones.className = 'rule-zones';
      zones.textContent = 'Zones: ' + zonesText;

      const type = document.createElement('span');
      type.className = 'rule-type';
      type.textContent = 'Type: ' + rule.alert_type.replace(/_/g, ' ');

      details.appendChild(zones);
      if (condText) {
        const cond = document.createElement('span');
        cond.className = 'rule-conditions';
        cond.textContent = 'Conditions: ' + condText;
        details.appendChild(cond);
      }

      el.appendChild(header);
      el.appendChild(details);
      container.appendChild(el);
    }
  }

  _editRule(rule) {
    this._editingRule = rule;
    const editor = this.container.querySelector('#alertRuleEditor');
    editor.style.display = 'block';

    this.container.querySelector('#ruleEditorTitle').textContent = `Edit: ${rule.name}`;
    this.container.querySelector('#ruleEditSeverity').value = rule.severity;

    // Build zone checkboxes
    const zonesContainer = this.container.querySelector('#ruleEditZones');
    zonesContainer.innerHTML = '';
    for (const z of roomConfigService.order) {
      const label = document.createElement('label');
      label.className = 'zone-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = z;
      cb.checked = rule.zone_ids.includes(z);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + roomConfigService.getLabel(z)));
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
    this.container.querySelector('#alertRuleEditor').style.display = 'none';
  }

  async _testRule() {
    if (!this._editingRule) return;
    const resultEl = this.container.querySelector('#ruleTestResult');
    resultEl.style.display = 'block';
    resultEl.textContent = 'Testing rule...';
    resultEl.className = 'rule-test-result';

    try {
      const pose = await poseService.getCurrentPose();
      const persons = pose?.persons || [];
      const zoneId = this._editingRule.zone_ids[0] || 'living_room';

      const response = await alertService.evaluate({ zone_id: zoneId, persons });
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
