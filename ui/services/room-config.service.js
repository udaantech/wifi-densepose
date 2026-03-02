// Room Configuration Service — single source of truth for room/zone metadata.
// Fetches from GET /api/v1/pose/zones/config and caches in memory.

import { poseService } from './pose.service.js';

class RoomConfigService {
  constructor() {
    this._rooms = [];
    this._roomLabels = {};
    this._roomOrder = [];
    this._loaded = false;
    this._loading = null;
    this._subscribers = [];
  }

  /** Load room config from API. Safe to call multiple times. Pass force=true to reload. */
  async load(force = false) {
    if (this._loaded && !force) return this._rooms;
    if (this._loading) return this._loading;
    this._loading = this._fetch();
    const rooms = await this._loading;
    this._loading = null;
    if (force) this._notifySubscribers();
    return rooms;
  }

  /** Force reload (call after calibration completes). */
  async reload() {
    this._loaded = false;
    this._loading = null;
    await this.load();
    this._notifySubscribers();
  }

  async _fetch() {
    try {
      const data = await poseService.getZonesConfig();
      const zones = data?.zones || [];
      this._rooms = zones;
      this._roomLabels = {};
      this._roomOrder = [];
      for (const z of zones) {
        this._roomLabels[z.zone_id] = z.name;
        this._roomOrder.push(z.zone_id);
      }
      this._loaded = true;
    } catch (e) {
      // API may not be ready; use empty config
      this._rooms = [];
      this._roomLabels = {};
      this._roomOrder = [];
    }
    return this._rooms;
  }

  /** {zone_id: display_name} map. */
  get labels() { return this._roomLabels; }

  /** Ordered array of zone_ids. */
  get order() { return this._roomOrder; }

  /** Full room config array. */
  get rooms() { return this._rooms; }

  /** Whether rooms have been loaded. */
  get isLoaded() { return this._loaded; }

  /** Whether any rooms are configured (calibration has run). */
  get hasRooms() { return this._rooms.length > 0; }

  /** Get display label for a zone_id, with fallback. */
  getLabel(zoneId) {
    return this._roomLabels[zoneId] || zoneId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /** Subscribe to config changes. Returns unsubscribe function. */
  onChange(callback) {
    this._subscribers.push(callback);
    return () => {
      const i = this._subscribers.indexOf(callback);
      if (i > -1) this._subscribers.splice(i, 1);
    };
  }

  _notifySubscribers() {
    for (const cb of this._subscribers) {
      try { cb(this._rooms); } catch (_) {}
    }
  }
}

export const roomConfigService = new RoomConfigService();
