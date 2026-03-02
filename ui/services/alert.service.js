// Alert Service - Client for alert API endpoints

import { apiService } from './api.service.js';

class AlertService {
  constructor() {
    this._pollInterval = null;
    this._callbacks = [];
  }

  async getAlerts(params = {}) {
    const query = {};
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;
    if (params.severity) query.severity = params.severity;
    if (params.alert_type) query.alert_type = params.alert_type;
    if (params.zone_id) query.zone_id = params.zone_id;
    if (params.acknowledged !== undefined && params.acknowledged !== null) query.acknowledged = params.acknowledged;
    return apiService.get('/api/v1/alerts/', query);
  }

  async getSummary() {
    return apiService.get('/api/v1/alerts/summary');
  }

  async acknowledge(alertId) {
    return apiService.post(`/api/v1/alerts/acknowledge/${alertId}`);
  }

  async acknowledgeAll() {
    return apiService.post('/api/v1/alerts/acknowledge-all');
  }

  async clearAlerts() {
    return apiService.delete('/api/v1/alerts/clear');
  }

  async getRules() {
    return apiService.get('/api/v1/alerts/rules');
  }

  async updateRule(ruleId, updates) {
    return apiService.put(`/api/v1/alerts/rules/${ruleId}`, updates);
  }

  async evaluate(poseData) {
    return apiService.post('/api/v1/alerts/evaluate', poseData);
  }

  startPolling(intervalMs = 5000) {
    this.stopPolling();
    this._pollInterval = setInterval(async () => {
      try {
        const data = await this.getSummary();
        this._callbacks.forEach(cb => cb(data));
      } catch (e) {
        // silent
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  onUpdate(callback) {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
}

export const alertService = new AlertService();
