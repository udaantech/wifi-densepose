// Mock Server for Testing WiFi DensePose UI

export class MockServer {
  constructor() {
    this.endpoints = new Map();
    this.websockets = new Set();
    this.isRunning = false;
    // Canonical zone list — all endpoints read from this
    this._zones = [
      { zone_id: 'hall', name: 'Hall', zone_type: 'living_room', description: 'Main hall / living area (35m²)', enabled: true, boundaries: { x_min: 0, x_max: 7, y_min: 0, y_max: 5, z_min: 0, z_max: 3 }, confidence_threshold: 0.7, max_persons: 8, calibration_data: null },
      { zone_id: 'kitchen', name: 'Kitchen', zone_type: 'kitchen', description: 'Kitchen (12m²)', enabled: true, boundaries: { x_min: 0, x_max: 4, y_min: 0, y_max: 3, z_min: 0, z_max: 3 }, confidence_threshold: 0.72, max_persons: 4, calibration_data: null },
      { zone_id: 'master_bedroom', name: 'Master Bedroom', zone_type: 'bedroom', description: 'Master bedroom (20m²)', enabled: true, boundaries: { x_min: 0, x_max: 5, y_min: 0, y_max: 4, z_min: 0, z_max: 3 }, confidence_threshold: 0.72, max_persons: 3, calibration_data: null },
      { zone_id: 'bedroom_2', name: 'Bedroom 2', zone_type: 'bedroom', description: 'Second bedroom (14m²)', enabled: true, boundaries: { x_min: 0, x_max: 3.5, y_min: 0, y_max: 4, z_min: 0, z_max: 3 }, confidence_threshold: 0.72, max_persons: 3, calibration_data: null },
      { zone_id: 'bedroom_3', name: 'Bedroom 3', zone_type: 'bedroom', description: 'Third bedroom (12m²)', enabled: true, boundaries: { x_min: 0, x_max: 3, y_min: 0, y_max: 4, z_min: 0, z_max: 3 }, confidence_threshold: 0.72, max_persons: 3, calibration_data: null },
      { zone_id: 'bathroom_master', name: 'Master Bathroom', zone_type: 'bathroom', description: 'Attached master bathroom (6m²)', enabled: true, boundaries: { x_min: 0, x_max: 2, y_min: 0, y_max: 3, z_min: 0, z_max: 3 }, confidence_threshold: 0.75, max_persons: 2, calibration_data: null },
      { zone_id: 'bathroom_common', name: 'Common Bathroom', zone_type: 'bathroom', description: 'Shared bathroom (5m²)', enabled: true, boundaries: { x_min: 0, x_max: 2, y_min: 0, y_max: 2.5, z_min: 0, z_max: 3 }, confidence_threshold: 0.75, max_persons: 2, calibration_data: null },
      { zone_id: 'hallway', name: 'Hallway', zone_type: 'hallway', description: 'Connecting hallway (8m²)', enabled: true, boundaries: { x_min: 0, x_max: 1.5, y_min: 0, y_max: 5.5, z_min: 0, z_max: 3 }, confidence_threshold: 0.75, max_persons: 3, calibration_data: null },
    ];
    this.setupDefaultEndpoints();
  }

  /** Get zone_id list from canonical zones. */
  get zoneIds() { return this._zones.map(z => z.zone_id); }

  // Set up default mock endpoints
  setupDefaultEndpoints() {
    // Health endpoints
    this.addEndpoint('GET', '/health/health', () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        pose: { status: 'healthy', message: 'Pose detection service running' },
        hardware: { status: 'healthy', message: 'Hardware connected' },
        stream: { status: 'healthy', message: 'Streaming service active' }
      },
      system_metrics: {
        cpu: { percent: Math.random() * 30 + 10 },
        memory: { percent: Math.random() * 40 + 20 },
        disk: { percent: Math.random() * 20 + 5 }
      }
    }));

    this.addEndpoint('GET', '/health/ready', () => ({
      status: 'ready',
      checks: {
        database: 'ready',
        hardware: 'ready',
        inference: 'ready'
      }
    }));

    this.addEndpoint('GET', '/health/live', () => ({
      status: 'alive',
      timestamp: new Date().toISOString()
    }));

    this.addEndpoint('GET', '/health/version', () => ({
      name: 'WiFi-DensePose API',
      version: '1.0.0',
      environment: 'development',
      build: '2025-01-07-dev'
    }));

    // API info endpoints
    this.addEndpoint('GET', '/', () => ({
      name: 'WiFi-DensePose API',
      version: '1.0.0',
      environment: 'development',
      features: {
        pose_estimation: true,
        streaming: true,
        authentication: false,
        rate_limiting: true,
        metrics: true
      },
      endpoints: [
        '/health',
        '/api/v1/pose',
        '/api/v1/stream'
      ]
    }));

    this.addEndpoint('GET', '/api/v1/info', () => ({
      name: 'WiFi-DensePose API',
      version: '1.0.0',
      environment: 'development',
      zones: this.zoneIds,
      routers: ['router-001', 'router-002'],
      features: {
        pose_estimation: true,
        streaming: true,
        multi_zone: true,
        real_time: true
      },
      rate_limits: {
        requests_per_minute: 60,
        burst: 10
      }
    }));

    this.addEndpoint('GET', '/api/v1/status', () => ({
      services: {
        api: 'running',
        hardware: 'connected',
        inference: 'ready',
        streaming: Math.random() > 0.5 ? 'active' : 'idle'
      },
      streaming: {
        active_connections: Math.floor(Math.random() * 5),
        total_messages: Math.floor(Math.random() * 1000),
        uptime: Math.floor(Date.now() / 1000) - 1800
      }
    }));

    // Pose endpoints
    this.addEndpoint('GET', '/api/v1/pose/current', () => {
      const activities = ['standing', 'sitting', 'walking', 'lying'];
      const persons = [];
      const zoneSummary = {};
      // Each room has a 60% chance of having a person, some rooms may have 2
      for (const zoneId of this.zoneIds) {
        const count = Math.random() < 0.6 ? (Math.random() < 0.3 ? 2 : 1) : 0;
        zoneSummary[zoneId] = count;
        for (let i = 0; i < count; i++) {
          persons.push({
            person_id: `${zoneId}_person_${i}`,
            confidence: Math.random() * 0.2 + 0.8,
            bounding_box: { x: 100, y: 50, width: 120, height: 300 },
            keypoints: this.generateMockKeypoints(),
            zone_id: zoneId,
            activity: activities[Math.floor(Math.random() * activities.length)]
          });
        }
      }
      return {
        timestamp: new Date().toISOString(),
        frame_id: `frame_${Date.now()}`,
        persons,
        zone_summary: zoneSummary,
        processing_time_ms: Math.random() * 20 + 5,
        total_detections: Math.floor(Math.random() * 10000)
      };
    });

    this.addEndpoint('GET', '/api/v1/pose/zones/summary', () => {
      const zones = {};
      for (const zid of this.zoneIds) {
        zones[zid] = { occupancy: Math.floor(Math.random() * 2), max_occupancy: 10, status: Math.random() > 0.5 ? 'active' : 'inactive' };
      }
      return { timestamp: new Date().toISOString(), total_persons: Object.values(zones).reduce((s, z) => s + z.occupancy, 0), zones, active_zones: Object.values(zones).filter(z => z.occupancy > 0).length };
    });

    // Zone configuration endpoint — provides room metadata for all tabs
    this.addEndpoint('GET', '/api/v1/pose/zones/config', () => ({
      zones: this._zones,
      total: this._zones.length,
      calibrated: this._zones.length > 0,
    }));

    // Add zone
    this.addEndpoint('POST', '/api/v1/pose/zones', (opts) => {
      try {
        const body = JSON.parse(opts.body || '{}');
        if (!body.zone_id) return { error: 'zone_id required' };
        if (this._zones.find(z => z.zone_id === body.zone_id)) return { error: 'zone already exists' };
        const zone = { zone_id: body.zone_id, name: body.name || body.zone_id, zone_type: body.zone_type || 'room', description: body.description || '', enabled: true, boundaries: { x_min: 0, x_max: body.x_max || 4, y_min: 0, y_max: body.y_max || 4, z_min: 0, z_max: 3 }, confidence_threshold: body.confidence_threshold || 0.7, max_persons: body.max_persons || 5, calibration_data: null };
        this._zones.push(zone);
        return { zone_id: body.zone_id, name: zone.name, status: 'created', total_zones: this._zones.length };
      } catch (e) { return { error: e.message }; }
    });

    // Delete zone
    this.addDynamicEndpoint('DELETE', /^\/api\/v1\/pose\/zones\/([^/]+)$/, (match) => {
      const zid = match[1];
      const idx = this._zones.findIndex(z => z.zone_id === zid);
      if (idx === -1) return { error: 'not found' };
      this._zones.splice(idx, 1);
      return { zone_id: zid, status: 'deleted', total_zones: this._zones.length };
    });

    // Stream endpoints
    this.addEndpoint('GET', '/api/v1/stream/status', () => ({
      is_active: Math.random() > 0.3,
      connected_clients: Math.floor(Math.random() * 10),
      messages_sent: Math.floor(Math.random() * 5000),
      uptime: Math.floor(Date.now() / 1000) - 900
    }));

    this.addEndpoint('POST', '/api/v1/stream/start', () => ({
      message: 'Streaming started',
      status: 'active'
    }));

    this.addEndpoint('POST', '/api/v1/stream/stop', () => ({
      message: 'Streaming stopped',
      status: 'inactive'
    }));

    // Alert endpoints
    this.addEndpoint('GET', '/api/v1/alerts/', () => ({
      alerts: this.generateMockAlerts(),
      total: 5,
      limit: 50,
      offset: 0
    }));

    this.addEndpoint('GET', '/api/v1/alerts/summary', () => ({
      total: 5,
      unacknowledged: 3,
      by_severity: { critical: 1, warning: 2, info: 2 },
      by_type: { intrusion: 1, occupancy_change: 2, fall_detected: 1, unusual_activity: 1 },
      rules_active: 3,
      rules_total: 4
    }));

    this.addEndpoint('GET', '/api/v1/alerts/rules', () => ({
      rules: [
        { id: 'rule_intrusion', name: 'Intrusion Detection', alert_type: 'intrusion', zone_ids: this.zoneIds.filter(z => ['hallway', 'hall'].includes(z)), enabled: true, severity: 'critical', conditions: { trigger: 'person_detected', schedule: 'away' } },
        { id: 'rule_fall', name: 'Fall Detection', alert_type: 'fall_detected', zone_ids: this.zoneIds, enabled: true, severity: 'critical', conditions: { activity: 'falling' } },
        { id: 'rule_zone', name: 'Restricted Zone', alert_type: 'zone_violation', zone_ids: this.zoneIds.filter(z => z.includes('kitchen')), enabled: false, severity: 'warning', conditions: { trigger: 'person_detected', schedule: 'night' } },
        { id: 'rule_occupancy', name: 'Occupancy Change', alert_type: 'occupancy_change', zone_ids: this.zoneIds, enabled: true, severity: 'info', conditions: { trigger: 'occupancy_change' } }
      ]
    }));

    this.addEndpoint('POST', '/api/v1/alerts/acknowledge-all', () => ({ acknowledged: 3 }));
    this.addEndpoint('DELETE', '/api/v1/alerts/clear', () => ({ cleared: 5 }));

    // Pose activities endpoint
    this.addEndpoint('GET', '/api/v1/pose/activities', () => ({
      activities: this.generateMockActivities(),
      total_count: 10,
      zone_id: null
    }));

    // Zone occupancy detail endpoint (matches /api/v1/pose/zones/*/occupancy)
    this.addDynamicEndpoint('GET', /^\/api\/v1\/pose\/zones\/([^/]+)\/occupancy$/, (match) => {
      const zoneId = match[1];
      const count = Math.floor(Math.random() * 3);
      const persons = [];
      const activities = ['standing', 'sitting', 'walking', 'lying'];
      for (let i = 0; i < count; i++) {
        persons.push({
          person_id: `person_${i}`,
          confidence: Math.random() * 0.3 + 0.7,
          activity: activities[Math.floor(Math.random() * activities.length)],
          zone_id: zoneId
        });
      }
      return {
        zone_id: zoneId,
        current_occupancy: count,
        max_occupancy: 5,
        persons,
        timestamp: new Date().toISOString()
      };
    });

    // System metrics endpoint
    this.addEndpoint('GET', '/health/metrics', () => ({
      cpu: { percent: Math.random() * 30 + 10, count: 8 },
      memory: { percent: Math.random() * 40 + 20, total: 17179869184, used: 8589934592, available: 8589934592 },
      disk: { percent: Math.random() * 30 + 15, total: 500107862016, used: 125026965504, free: 375080896512 },
      network: { bytes_sent: Math.floor(Math.random() * 1e9), bytes_recv: Math.floor(Math.random() * 2e9), packets_sent: Math.floor(Math.random() * 1e6), packets_recv: Math.floor(Math.random() * 2e6) },
      load_average: { '1min': Math.random() * 2, '5min': Math.random() * 1.5, '15min': Math.random() * 1 },
      process: { pid: 12345, cpu_percent: Math.random() * 10, memory_mb: Math.random() * 200 + 50, threads: Math.floor(Math.random() * 20) + 4 }
    }));

    // Stream clients endpoint
    this.addEndpoint('GET', '/api/v1/stream/clients', () => ({
      clients: [
        { client_id: 'client-001', stream_type: 'pose', connected_at: new Date(Date.now() - 300000).toISOString(), zone_ids: ['living_room'] },
        { client_id: 'client-002', stream_type: 'events', connected_at: new Date(Date.now() - 120000).toISOString(), zone_ids: [] }
      ]
    }));

    // Stream metrics
    this.addEndpoint('GET', '/api/v1/stream/metrics', () => ({
      total_messages: Math.floor(Math.random() * 50000),
      average_latency_ms: Math.random() * 15 + 3,
      active_connections: 2,
      buffer_size: Math.floor(Math.random() * 100)
    }));

    // Single alert acknowledge
    this.addDynamicEndpoint('POST', /^\/api\/v1\/alerts\/acknowledge\/([^/]+)$/, (match) => ({
      alert_id: match[1],
      acknowledged: true,
      acknowledged_at: new Date().toISOString()
    }));

    // Single alert rule update
    this.addDynamicEndpoint('PUT', /^\/api\/v1\/alerts\/rules\/([^/]+)$/, (match) => ({
      rule_id: match[1],
      updated: true
    }));

    // Calibration endpoints
    this.addEndpoint('POST', '/api/v1/pose/calibrate', () => ({
      status: 'started',
      message: 'Calibration process initiated',
      phases: ['baseline', 'zone_mapping', 'presence', 'validation'],
      current_phase: 0
    }));

    this.addEndpoint('GET', '/api/v1/pose/calibration/status', () => ({
      status: 'idle',
      current_phase: null,
      progress: 0,
      zones_calibrated: 5,
      last_calibrated: new Date().toISOString()
    }));

    // Stream client disconnect
    this.addDynamicEndpoint('DELETE', /^\/api\/v1\/stream\/clients\/([^/]+)$/, (match) => ({
      client_id: match[1],
      disconnected: true
    }));

    // Alert evaluate endpoint
    this.addEndpoint('POST', '/api/v1/alerts/evaluate', () => ({
      alerts_triggered: Math.random() > 0.5 ? [
        { id: 'test_alert_1', type: 'intrusion', severity: 'warning', message: 'Test alert triggered' }
      ] : [],
      rules_evaluated: 4
    }));

    // Stats with full statistics object
    this.addEndpoint('GET', '/api/v1/pose/stats', () => ({
      period: {
        start_time: new Date(Date.now() - 86400000).toISOString(),
        end_time: new Date().toISOString(),
        hours: 24
      },
      statistics: {
        total_detections: Math.floor(Math.random() * 5000) + 1000,
        successful_detections: Math.floor(Math.random() * 4500) + 900,
        failed_detections: Math.floor(Math.random() * 50),
        average_confidence: Math.random() * 0.2 + 0.75,
        average_processing_time_ms: Math.random() * 15 + 5,
        peak_persons: Math.floor(Math.random() * 5) + 1,
        max_persons_detected: Math.floor(Math.random() * 5) + 1
      }
    }));
  }

  // Generate mock activities
  generateMockActivities() {
    const zones = this.zoneIds;
    const activities = ['standing', 'sitting', 'walking', 'lying', 'running', 'falling'];
    const weights = [0.3, 0.25, 0.2, 0.1, 0.1, 0.05]; // weighted distribution
    const result = [];
    for (let i = 0; i < 10; i++) {
      const r = Math.random();
      let cumulative = 0;
      let activity = activities[0];
      for (let j = 0; j < weights.length; j++) {
        cumulative += weights[j];
        if (r < cumulative) { activity = activities[j]; break; }
      }
      result.push({
        person_id: `person_${i % 4}`,
        zone_id: zones[Math.floor(Math.random() * zones.length)],
        activity,
        confidence: Math.random() * 0.3 + 0.7,
        timestamp: new Date(Date.now() - i * 60000).toISOString()
      });
    }
    return result;
  }

  // Generate mock alerts
  generateMockAlerts() {
    const zones = this.zoneIds;
    const types = [
      { type: 'intrusion', severity: 'critical', title: 'Intrusion Detected', msg: 'Person detected in' },
      { type: 'fall_detected', severity: 'critical', title: 'Fall Detected', msg: 'Person may have fallen in' },
      { type: 'occupancy_change', severity: 'info', title: 'Occupancy Change', msg: 'Person entered' },
      { type: 'unusual_activity', severity: 'warning', title: 'Unusual Activity', msg: 'Unusual movement pattern in' },
    ];
    const alerts = [];
    for (let i = 0; i < 5; i++) {
      const t = types[i % types.length];
      const z = zones[i % zones.length];
      const ts = new Date(Date.now() - i * 120000).toISOString();
      alerts.push({
        id: `alert_mock_${i}`,
        alert_type: t.type,
        severity: t.severity,
        zone_id: z,
        title: t.title,
        message: `${t.msg} ${z.replace(/_/g, ' ')}`,
        timestamp: ts,
        acknowledged: i >= 3,
        acknowledged_at: i >= 3 ? ts : null,
        metadata: {}
      });
    }
    return alerts;
  }

  // Generate mock person data
  generateMockPersons(count) {
    const zones = this.zoneIds;
    const activities = ['standing', 'sitting', 'walking', 'lying'];
    const persons = [];
    for (let i = 0; i < count; i++) {
      persons.push({
        person_id: `person_${i}`,
        confidence: Math.random() * 0.3 + 0.7,
        bbox: {
          x: Math.random() * 400,
          y: Math.random() * 300,
          width: Math.random() * 100 + 50,
          height: Math.random() * 150 + 100
        },
        keypoints: this.generateMockKeypoints(),
        zone_id: zones[Math.floor(Math.random() * zones.length)],
        activity: activities[Math.floor(Math.random() * activities.length)]
      });
    }
    return persons;
  }

  // Generate mock keypoints (COCO format)
  // Coordinates are in 800x600 space; PoseRenderer scales via (x/800)*canvasW
  generateMockKeypoints() {
    const keypoints = [];
    // Center the skeleton in the 800x600 coordinate space with slight random offset
    const centerX = 400 + (Math.random() - 0.5) * 160;
    const centerY = 280 + (Math.random() - 0.5) * 40;

    // COCO keypoint order: nose, left_eye, right_eye, left_ear, right_ear,
    // left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist,
    // left_hip, right_hip, left_knee, right_knee, left_ankle, right_ankle
    const offsets = [
      [0, -100],    // nose
      [-12, -112],  // left_eye
      [12, -112],   // right_eye
      [-24, -106],  // left_ear
      [24, -106],   // right_ear
      [-50, -50],   // left_shoulder
      [50, -50],    // right_shoulder
      [-75, 15],    // left_elbow
      [75, 15],     // right_elbow
      [-80, 75],    // left_wrist
      [80, 75],     // right_wrist
      [-25, 75],    // left_hip
      [25, 75],     // right_hip
      [-30, 155],   // left_knee
      [30, 155],    // right_knee
      [-30, 230],   // left_ankle
      [30, 230]     // right_ankle
    ];

    for (let i = 0; i < 17; i++) {
      keypoints.push({
        x: centerX + offsets[i][0] + (Math.random() - 0.5) * 8,
        y: centerY + offsets[i][1] + (Math.random() - 0.5) * 8,
        confidence: Math.random() * 0.15 + 0.85
      });
    }
    return keypoints;
  }

  // Add a mock endpoint
  addEndpoint(method, path, handler) {
    const key = `${method.toUpperCase()} ${path}`;
    this.endpoints.set(key, handler);
  }

  // Add a dynamic endpoint with regex pattern
  addDynamicEndpoint(method, pattern, handler) {
    if (!this.dynamicEndpoints) this.dynamicEndpoints = [];
    this.dynamicEndpoints.push({ method: method.toUpperCase(), pattern, handler });
  }

  // Match dynamic endpoints
  _matchDynamic(method, path) {
    if (!this.dynamicEndpoints) return null;
    for (const ep of this.dynamicEndpoints) {
      if (ep.method === method) {
        const match = path.match(ep.pattern);
        if (match) return { handler: ep.handler, match };
      }
    }
    return null;
  }

  // Start the mock server
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.interceptFetch();
    this.interceptWebSocket();
    console.log('Mock server started');
  }

  // Stop the mock server
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.restoreFetch();
    this.restoreWebSocket();
    console.log('Mock server stopped');
  }

  // Intercept fetch requests
  interceptFetch() {
    this.originalFetch = window.fetch;
    
    window.fetch = async (url, options = {}) => {
      if (!this.isRunning) {
        return this.originalFetch(url, options);
      }

      const method = options.method || 'GET';
      const path = new URL(url, window.location.origin).pathname;
      const key = `${method.toUpperCase()} ${path}`;
      
      let handler = null;
      let handlerArg = options;

      if (this.endpoints.has(key)) {
        handler = this.endpoints.get(key);
      } else {
        // Check dynamic endpoints
        const dynMatch = this._matchDynamic(method.toUpperCase(), path);
        if (dynMatch) {
          handler = dynMatch.handler;
          handlerArg = dynMatch.match;
        }
      }

      if (handler) {
        const delay = Math.random() * 100 + 50; // Simulate network delay

        await new Promise(resolve => setTimeout(resolve, delay));

        try {
          const data = handler(handlerArg);
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // If no mock endpoint, fall back to original fetch
      return this.originalFetch(url, options);
    };
  }

  // Restore original fetch
  restoreFetch() {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
  }

  // Intercept WebSocket connections
  interceptWebSocket() {
    this.originalWebSocket = window.WebSocket;
    
    window.WebSocket = class MockWebSocket extends EventTarget {
      constructor(url, protocols) {
        super();
        this.url = url;
        this.protocols = protocols;
        this.readyState = WebSocket.CONNECTING;
        this.bufferedAmount = 0;
        
        // Simulate connection
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
          
          // Start sending mock data
          this.startMockData();
        }, 100);
      }
      
      send(data) {
        if (this.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
        
        // Echo back or handle specific commands
        try {
          const message = JSON.parse(data);
          if (message.type === 'ping') {
            setTimeout(() => {
              this.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({ type: 'pong' })
              }));
            }, 10);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
      
      close(code = 1000, reason = '') {
        this.readyState = WebSocket.CLOSING;
        setTimeout(() => {
          this.readyState = WebSocket.CLOSED;
          this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean: true }));
        }, 50);
      }
      
      startMockData() {
        // Send connection established message
        setTimeout(() => {
          this.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'connection_established',
              payload: { client_id: 'mock-client-123' }
            })
          }));
        }, 50);
        
        // Send periodic pose data if this is a pose stream
        if (this.url.includes('/stream/pose')) {
          const wsZones = mockServer.zoneIds;
          const wsActivities = ['standing', 'sitting', 'walking', 'lying'];
          this.poseInterval = setInterval(() => {
            if (this.readyState === WebSocket.OPEN) {
              const zoneId = wsZones[Math.floor(Math.random() * wsZones.length)];
              const personCount = Math.random() < 0.6 ? (Math.random() < 0.3 ? 2 : 1) : 0;
              const persons = [];
              for (let i = 0; i < personCount; i++) {
                persons.push({
                  person_id: `${zoneId}_person_${i}`,
                  confidence: Math.random() * 0.2 + 0.8,
                  keypoints: mockServer.generateMockKeypoints(),
                  zone_id: zoneId,
                  activity: wsActivities[Math.floor(Math.random() * wsActivities.length)]
                });
              }
              this.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'pose_data',
                  timestamp: new Date().toISOString(),
                  zone_id: zoneId,
                  data: {
                    pose: { persons },
                    confidence: Math.random() * 0.2 + 0.8,
                    activity: wsActivities[Math.floor(Math.random() * wsActivities.length)]
                  },
                  metadata: {
                    frame_id: `frame_${Date.now()}`,
                    processing_time_ms: Math.random() * 20 + 5
                  }
                })
              }));
            }
          }, 1000);
        }

        // Send periodic events if this is an event stream
        if (this.url.includes('/stream/events')) {
          const evtZones = mockServer.zoneIds;
          const evtTypes = ['zone_entry', 'zone_exit', 'activity_change'];
          this.eventInterval = setInterval(() => {
            if (this.readyState === WebSocket.OPEN && Math.random() > 0.7) {
              this.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'system_event',
                  payload: {
                    event_type: evtTypes[Math.floor(Math.random() * evtTypes.length)],
                    zone_id: evtZones[Math.floor(Math.random() * evtZones.length)],
                    person_id: `person_${Math.floor(Math.random() * 4)}`,
                    timestamp: new Date().toISOString()
                  }
                })
              }));
            }
          }, 2000);
        }
      }
    };
    
    // Copy static properties
    window.WebSocket.CONNECTING = 0;
    window.WebSocket.OPEN = 1;
    window.WebSocket.CLOSING = 2;
    window.WebSocket.CLOSED = 3;
  }

  // Restore original WebSocket
  restoreWebSocket() {
    if (this.originalWebSocket) {
      window.WebSocket = this.originalWebSocket;
    }
  }

  // Add a custom response
  addCustomResponse(method, path, response) {
    this.addEndpoint(method, path, () => response);
  }

  // Simulate server error
  simulateError(method, path, status = 500, message = 'Internal Server Error') {
    this.addEndpoint(method, path, () => {
      throw new Error(message);
    });
  }

  // Simulate slow response
  addSlowEndpoint(method, path, handler, delay = 2000) {
    this.addEndpoint(method, path, async (...args) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return handler(...args);
    });
  }
}

// Create and export mock server instance
export const mockServer = new MockServer();