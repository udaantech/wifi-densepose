/**
 * CalibrationTab – multi-step calibration wizard for WiFi-DensePose.
 *
 * Phases:
 *  1. Environment Baseline (empty-room noise floor)
 *  2. Zone Mapping (per-zone CSI signatures)
 *  3. Presence Calibration (detection threshold tuning)
 *  4. Validation (accuracy measurement)
 */

import { poseService } from '../services/pose.service.js';

const PHASES = [
  { id: 1, label: 'Environment Baseline', sub: 'Empty room scan' },
  { id: 2, label: 'Zone Mapping',         sub: 'CSI signatures' },
  { id: 3, label: 'Presence Calibration', sub: 'Detection thresholds' },
  { id: 4, label: 'Validation',           sub: 'Accuracy check' },
];

export class CalibrationTab {
  constructor(container) {
    this.container = container;
    this.state = {
      isCalibrating: false,
      currentPhase: 0,
      phaseName: 'idle',
      progressPercent: 0,
      phaseResults: {},
      calibrationResults: null,
      error: null,
    };
    this._pollTimer = null;
  }

  async init() {
    this._render();
    this._bind();
    await this._loadStatus();
  }

  dispose() {
    this._stopPolling();
  }

  // ── Rendering ────────────────────────────────────────────────────

  _render() {
    this.container.innerHTML = `
      <div class="calibration-wizard">
        <h2 class="calibration-title">System Calibration</h2>
        <p class="calibration-desc">
          Run a 4-phase calibration to establish baseline noise floor, map zone signatures,
          tune detection thresholds, and validate accuracy.
        </p>

        <!-- Stepper -->
        <div class="calibration-stepper">
          ${PHASES.map((p, i) => `
            <div class="stepper-step" data-phase="${p.id}" id="step-${p.id}">
              <div class="step-circle">${p.id}</div>
              <div class="step-text">
                <div class="step-label">${p.label}</div>
                <div class="step-sublabel">${p.sub}</div>
              </div>
            </div>
            ${i < PHASES.length - 1 ? '<div class="stepper-connector"></div>' : ''}
          `).join('')}
        </div>

        <!-- Progress -->
        <div class="calibration-progress" id="cal-progress-section" style="display:none">
          <div class="progress-bar-outer">
            <div class="progress-bar-fill" id="cal-progress-bar" style="width:0%"></div>
          </div>
          <div class="progress-info">
            <span id="cal-phase-label">Initializing...</span>
            <span id="cal-progress-pct">0%</span>
          </div>
        </div>

        <!-- Phase metrics (shown during calibration) -->
        <div class="phase-metrics" id="cal-phase-metrics" style="display:none"></div>

        <!-- Error display -->
        <div class="calibration-error" id="cal-error" style="display:none"></div>

        <!-- Actions -->
        <div class="calibration-actions">
          <button class="btn btn-primary" id="cal-start-btn">Start Calibration</button>
        </div>

        <!-- Results (shown after completion) -->
        <div class="calibration-results" id="cal-results" style="display:none">
          <h3>Calibration Results</h3>
          <div class="results-grid" id="cal-results-grid"></div>
        </div>
      </div>
    `;
  }

  _bind() {
    const btn = this.container.querySelector('#cal-start-btn');
    if (btn) btn.addEventListener('click', () => this._startCalibration());
  }

  // ── Actions ──────────────────────────────────────────────────────

  async _startCalibration() {
    const btn = this.container.querySelector('#cal-start-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Calibrating...'; }

    this._setState({ isCalibrating: true, error: null, calibrationResults: null, currentPhase: 0 });
    this._showProgress(true);
    this._hideResults();

    try {
      await poseService.calibrate();
      this._startPolling();
    } catch (err) {
      this._setState({ isCalibrating: false, error: err.message || 'Failed to start calibration' });
      this._showError(this.state.error);
      if (btn) { btn.disabled = false; btn.textContent = 'Start Calibration'; }
    }
  }

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._pollStatus(), 1000);
  }

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  async _pollStatus() {
    try {
      const status = await poseService.getCalibrationStatus();
      this._updateFromStatus(status);
    } catch (err) {
      console.warn('[Calibration] Poll error:', err);
    }
  }

  async _loadStatus() {
    try {
      const status = await poseService.getCalibrationStatus();
      if (status && status.calibration_results) {
        this._setState({ calibrationResults: status.calibration_results, currentPhase: 4, phaseName: 'completed' });
        this._showResults(status.calibration_results);
        this._updateStepper(4, true);
      }
    } catch (_) { /* ignore – API may not be up */ }
  }

  _updateFromStatus(status) {
    if (!status) return;

    this._setState({
      currentPhase: status.current_phase || 0,
      phaseName: status.phase_name || 'idle',
      progressPercent: status.progress_percent || 0,
      phaseResults: status.phase_results || {},
    });

    // Update UI
    this._updateStepper(this.state.currentPhase, false);
    this._updateProgress(this.state.progressPercent, this.state.phaseName);
    this._updatePhaseMetrics(this.state.phaseResults, this.state.currentPhase);

    if (!status.is_calibrating && this.state.isCalibrating) {
      // Calibration just finished
      this._stopPolling();
      this._setState({ isCalibrating: false, calibrationResults: status.calibration_results });
      this._showProgress(false);
      this._updateStepper(4, true);

      const btn = this.container.querySelector('#cal-start-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Re-Calibrate'; }

      if (status.calibration_results) {
        this._showResults(status.calibration_results);
      }
    }
  }

  // ── UI Helpers ───────────────────────────────────────────────────

  _setState(partial) {
    Object.assign(this.state, partial);
  }

  _updateStepper(activePhase, completed) {
    PHASES.forEach(p => {
      const el = this.container.querySelector(`#step-${p.id}`);
      if (!el) return;
      el.classList.remove('active', 'completed');
      if (completed && p.id <= activePhase) el.classList.add('completed');
      else if (p.id === activePhase) el.classList.add('active');
      else if (p.id < activePhase) el.classList.add('completed');
    });
  }

  _showProgress(show) {
    const el = this.container.querySelector('#cal-progress-section');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  _updateProgress(pct, phaseName) {
    const bar = this.container.querySelector('#cal-progress-bar');
    const lbl = this.container.querySelector('#cal-phase-label');
    const pctEl = this.container.querySelector('#cal-progress-pct');
    if (bar) bar.style.width = `${pct}%`;
    if (lbl) lbl.textContent = this._phaseDisplayName(phaseName);
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  }

  _updatePhaseMetrics(results, currentPhase) {
    const el = this.container.querySelector('#cal-phase-metrics');
    if (!el) return;

    const entries = Object.entries(results);
    if (entries.length === 0) { el.style.display = 'none'; return; }

    el.style.display = 'block';
    const latest = results[currentPhase] || results[entries[entries.length - 1][0]];
    if (!latest) return;

    let html = '<div class="metrics-row">';
    if (latest.frames_collected !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Frames</span><span class="metric-value">${latest.frames_collected}</span></div>`;
    if (latest.noise_floor_db !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Noise Floor</span><span class="metric-value">${latest.noise_floor_db} dB</span></div>`;
    if (latest.phase_stability !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Phase Stability</span><span class="metric-value">${(latest.phase_stability * 100).toFixed(1)}%</span></div>`;
    if (latest.snr_estimate_db !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">SNR</span><span class="metric-value">${latest.snr_estimate_db} dB</span></div>`;
    if (latest.total_zones !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Zones Mapped</span><span class="metric-value">${latest.total_zones}</span></div>`;
    if (latest.signal_deviation !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Signal Deviation</span><span class="metric-value">${latest.signal_deviation.toFixed(4)}</span></div>`;
    if (latest.accuracy !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">Accuracy</span><span class="metric-value">${(latest.accuracy * 100).toFixed(1)}%</span></div>`;
    if (latest.f1_score !== undefined)
      html += `<div class="metric-chip"><span class="metric-label">F1 Score</span><span class="metric-value">${(latest.f1_score * 100).toFixed(1)}%</span></div>`;
    html += '</div>';
    el.innerHTML = html;
  }

  _showError(msg) {
    const el = this.container.querySelector('#cal-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(() => { if (el) el.style.display = 'none'; }, 10000);
  }

  _hideResults() {
    const el = this.container.querySelector('#cal-results');
    if (el) el.style.display = 'none';
  }

  _showResults(results) {
    const wrap = this.container.querySelector('#cal-results');
    const grid = this.container.querySelector('#cal-results-grid');
    if (!wrap || !grid) return;

    wrap.style.display = 'block';
    grid.innerHTML = '';

    // Card 1: Noise Floor
    const nf = results.noise_floor || {};
    grid.innerHTML += this._resultCard('Noise Floor', [
      ['Amplitude Mean', nf.amplitude_mean],
      ['Amplitude Var', nf.amplitude_variance],
      ['Noise Floor', `${nf.noise_floor_db} dB`],
      ['SNR', `${nf.snr_estimate_db} dB`],
      ['Phase Stability', `${((nf.phase_stability || 0) * 100).toFixed(1)}%`],
    ]);

    // Card 2: Discovered Rooms
    const zs = results.zone_signatures || {};
    const zoneRows = Object.entries(zs).map(([zid, z]) => {
      const name = z.zone_name || zid;
      const area = z.area_m2 ? ` (${z.area_m2.toFixed(0)}m\u00B2)` : '';
      const loss = z.path_loss_db !== undefined ? `, ${z.path_loss_db.toFixed(1)}dB` : '';
      return [
        `${name}${area}`,
        `centroid=${z.feature_centroid}${loss}`
      ];
    });
    grid.innerHTML += this._resultCard('Discovered Rooms', zoneRows.length ? zoneRows : [['Status', 'No rooms detected']]);

    // Card 3: Detection Thresholds
    const dt = results.detection_thresholds || {};
    const threshRows = [
      ['Noise Threshold', results.noise_threshold],
      ['Detection Threshold', results.human_detection_threshold],
      ...Object.entries(dt).map(([zid, t]) => [zid, t]),
    ];
    grid.innerHTML += this._resultCard('Detection Thresholds', threshRows);

    // Card 4: Validation
    const vm = results.validation_metrics || {};
    grid.innerHTML += this._resultCard('Validation', [
      ['Accuracy', `${((vm.accuracy || 0) * 100).toFixed(1)}%`],
      ['Precision', `${((vm.precision || 0) * 100).toFixed(1)}%`],
      ['Recall', `${((vm.recall || 0) * 100).toFixed(1)}%`],
      ['F1 Score', `${((vm.f1_score || 0) * 100).toFixed(1)}%`],
      ['TP / FP / TN / FN', `${vm.true_positives}/${vm.false_positives}/${vm.true_negatives}/${vm.false_negatives}`],
    ]);
  }

  _resultCard(title, rows) {
    const body = rows.map(([k, v]) => `
      <div class="result-row">
        <span class="result-key">${k}</span>
        <span class="result-val">${v ?? '-'}</span>
      </div>
    `).join('');
    return `<div class="result-card"><h4>${title}</h4>${body}</div>`;
  }

  _phaseDisplayName(name) {
    const map = {
      idle: 'Idle',
      environment_baseline: 'Phase 1: Collecting Baseline...',
      zone_mapping: 'Phase 2: Discovering Rooms...',
      presence_calibration: 'Phase 3: Presence Calibration...',
      validation: 'Phase 4: Validating...',
      completed: 'Calibration Complete',
    };
    return map[name] || name;
  }
}
