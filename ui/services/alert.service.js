// Alert Service - Client for alert API endpoints

import { apiService } from './api.service.js';

class AlertService {
  constructor() {
    this._pollInterval = null;
    this._callbacks = [];
  }

  async getAlerts(params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);
    if (params.severity) query.set('severity', params.severity);
    if (params.alert_type) query.set('alert_type', params.alert_type);
    if (params.zone_id) query.set('zone_id', params.zone_id);
    if (params.acknowledged !== undefined) query.set('acknowledged', params.acknowledged);
    const qs = query.toString();
    return apiService.get(`/api/v1/alerts/${qs ? '?' + qs : ''}`);
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
