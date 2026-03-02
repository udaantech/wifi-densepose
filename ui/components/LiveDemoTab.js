// Live View Tab — Multi-room pose detection display

import { poseService } from '../services/pose.service.js';
import { PoseRenderer } from '../utils/pose-renderer.js';
import { roomConfigService } from '../services/room-config.service.js';

export class LiveDemoTab {
  constructor(containerElement) {
    this.container = containerElement;
    this.state = {
      isActive: false,
      frameCount: 0,
      startTime: null,
    };
    this._pollInterval = null;
    this._uiUpdateInterval = null;
    this._roomRenderers = {}; // zoneId -> { canvas, renderer, persons }
  }

  async init() {
    await roomConfigService.load();
    this._buildDOM();
    this._bindEvents();
    this._unsubRoomConfig = roomConfigService.onChange(() => {
      this.stopDemo();
      this._createRoomCards();
    });
  }

  _buildDOM() {
    this.container.innerHTML = `
      <div class="liveview-header">
        <h2>Live View</h2>
        <div class="liveview-controls">
          <button id="liveviewStart" class="btn btn--primary btn--sm">Start Detection</button>
          <button id="liveviewStop" class="btn btn--secondary btn--sm" disabled>Stop Detection</button>
          <span class="liveview-status" id="liveviewStatus">Ready</span>
        </div>
      </div>

      <div class="liveview-stats" id="liveviewStats">
        <span>Frames: <strong id="liveviewFrames">0</strong></span>
        <span>Uptime: <strong id="liveviewUptime">0s</strong></span>
        <span>Total Persons: <strong id="liveviewPersons">0</strong></span>
      </div>

      <div class="liveview-grid" id="liveviewGrid"></div>
    `;

    this._createRoomCards();
  }

  _createRoomCards() {
    const grid = this.container.querySelector('#liveviewGrid');
    grid.innerHTML = '';

    const order = roomConfigService.order;
    if (order.length === 0) {
      grid.innerHTML = '<div class="liveview-empty" style="padding:40px;text-align:center;color:var(--color-text-secondary);font-style:italic;">No rooms configured. Run Calibration first.</div>';
      return;
    }

    for (const zoneId of order) {
      const card = document.createElement('div');
      card.className = 'liveview-room';
      card.id = `liveview-room-${zoneId}`;

      const header = document.createElement('div');
      header.className = 'liveview-room-header';

      const dot = document.createElement('span');
      dot.className = 'liveview-dot';
      dot.id = `liveview-dot-${zoneId}`;

      const name = document.createElement('span');
      name.className = 'liveview-room-name';
      name.textContent = roomConfigService.getLabel(zoneId);

      const count = document.createElement('span');
      count.className = 'liveview-room-count';
      count.id = `liveview-count-${zoneId}`;
      count.textContent = '0 persons';

      header.appendChild(dot);
      header.appendChild(name);
      header.appendChild(count);

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'liveview-canvas-wrap';

      const canvas = document.createElement('canvas');
      canvas.id = `liveview-canvas-${zoneId}`;
      canvas.width = 320;
      canvas.height = 240;
      canvasWrap.appendChild(canvas);

      const activity = document.createElement('div');
      activity.className = 'liveview-room-activity';
      activity.id = `liveview-activity-${zoneId}`;
      activity.textContent = 'Waiting...';

      card.appendChild(header);
      card.appendChild(canvasWrap);
      card.appendChild(activity);
      grid.appendChild(card);

      // Initialize renderer for this room
      try {
        const renderer = new PoseRenderer(canvas, {
          width: 320,
          height: 240,
          showKeypoints: true,
          showSkeleton: true,
          showBoundingBox: false,
          backgroundColor: '#1a1a2e',
        });
        this._roomRenderers[zoneId] = { canvas, renderer, persons: [] };
      } catch (e) {
        console.warn(`Failed to init renderer for ${zoneId}:`, e);
        this._roomRenderers[zoneId] = { canvas, renderer: null, persons: [] };
      }
    }
  }

  _bindEvents() {
    this.container.querySelector('#liveviewStart').addEventListener('click', () => this.startDemo());
    this.container.querySelector('#liveviewStop').addEventListener('click', () => this.stopDemo());
  }

  async startDemo() {
    if (this.state.isActive) return;
    this.state.isActive = true;
    this.state.startTime = Date.now();
    this.state.frameCount = 0;

    this.container.querySelector('#liveviewStart').disabled = true;
    this.container.querySelector('#liveviewStop').disabled = false;
    this.container.querySelector('#liveviewStatus').textContent = 'Active';
    this.container.querySelector('#liveviewStatus').classList.add('active');

    this._pollInterval = setInterval(() => this._fetchAndRender(), 500);
    this._uiUpdateInterval = setInterval(() => this._updateStats(), 1000);
    this._fetchAndRender();
  }

  stopDemo() {
    if (!this.state.isActive) return;
    this.state.isActive = false;

    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
    if (this._uiUpdateInterval) { clearInterval(this._uiUpdateInterval); this._uiUpdateInterval = null; }

    this.container.querySelector('#liveviewStart').disabled = false;
    this.container.querySelector('#liveviewStop').disabled = true;
    this.container.querySelector('#liveviewStatus').textContent = 'Stopped';
    this.container.querySelector('#liveviewStatus').classList.remove('active');

    // Clear all canvases
    for (const [zoneId, room] of Object.entries(this._roomRenderers)) {
      if (room.renderer) room.renderer.clearCanvas();
      room.persons = [];
      this._updateRoomUI(zoneId, []);
    }
  }

  async _fetchAndRender() {
    try {
      const pose = await poseService.getCurrentPose();
      if (!pose) return;

      this.state.frameCount++;
      const persons = pose.persons || [];

      // Group persons by zone
      const byZone = {};
      for (const zoneId of roomConfigService.order) byZone[zoneId] = [];

      for (const p of persons) {
        const zoneId = p.zone_id || 'living_room';
        if (!byZone[zoneId]) byZone[zoneId] = [];
        byZone[zoneId].push(p);
      }

      // Update total count
      const totalEl = this.container.querySelector('#liveviewPersons');
      if (totalEl) totalEl.textContent = persons.length;

      // Render each room
      for (const [zoneId, roomPersons] of Object.entries(byZone)) {
        const room = this._roomRenderers[zoneId];
        if (!room) continue;
        room.persons = roomPersons;

        this._updateRoomUI(zoneId, roomPersons);

        if (room.renderer) {
          // Normalize keypoints for renderer
          const normalized = roomPersons.map(p => ({
            person_id: p.person_id,
            confidence: p.confidence || 0,
            keypoints: p.keypoints || [],
            bbox: p.bounding_box || p.bbox || null,
            activity: p.activity || 'unknown',
          }));

          room.renderer.render({
            persons: normalized,
            timestamp: Date.now(),
            metadata: { zone_id: zoneId },
          });
        }
      }
    } catch (e) {
      // Silent - API may not be ready
    }
  }

  _updateRoomUI(zoneId, persons) {
    const count = persons.length;

    const dotEl = this.container.querySelector(`#liveview-dot-${zoneId}`);
    if (dotEl) dotEl.className = `liveview-dot ${count > 0 ? 'active' : ''}`;

    const countEl = this.container.querySelector(`#liveview-count-${zoneId}`);
    if (countEl) countEl.textContent = `${count} person${count !== 1 ? 's' : ''}`;

    const actEl = this.container.querySelector(`#liveview-activity-${zoneId}`);
    if (actEl) {
      if (count === 0) {
        actEl.textContent = 'Empty';
        actEl.className = 'liveview-room-activity empty';
      } else {
        const activities = persons.map(p => p.activity || 'unknown');
        const hasFall = activities.includes('falling');
        actEl.textContent = activities.join(', ');
        actEl.className = `liveview-room-activity ${hasFall ? 'danger' : 'active'}`;
      }
    }

    const card = this.container.querySelector(`#liveview-room-${zoneId}`);
    if (card) {
      card.classList.toggle('occupied', count > 0);
    }
  }

  _updateStats() {
    const framesEl = this.container.querySelector('#liveviewFrames');
    if (framesEl) framesEl.textContent = this.state.frameCount;

    const uptimeEl = this.container.querySelector('#liveviewUptime');
    if (uptimeEl && this.state.startTime) {
      const sec = Math.round((Date.now() - this.state.startTime) / 1000);
      uptimeEl.textContent = `${sec}s`;
    }
  }

  dispose() {
    this.stopDemo();
    if (this._unsubRoomConfig) this._unsubRoomConfig();
    for (const room of Object.values(this._roomRenderers)) {
      if (room.renderer && room.renderer.dispose) room.renderer.dispose();
    }
    this._roomRenderers = {};
  }
}
