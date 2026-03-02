# WiFi DensePose Home Automation

Complete home automation setup using WiFi sensing for presence detection, vital signs monitoring, and smart home integration.

## 🚀 Quick Start (5 minutes)

### Option A: Docker (Recommended)

```bash
# 1. Start the WiFi sensing stack
docker compose -f docker-compose.home.yml up -d

# 2. Open the web UI
open http://localhost:3000

# 3. Check API is working
curl http://localhost:3000/api/v1/sensing/latest
```

### Option B: With MQTT & Home Assistant

```bash
# Start with MQTT bridge and logging
docker compose -f docker-compose.home.yml --profile mqtt --profile logging up -d

# Install monitoring script
pip install -r home-automation/scripts/requirements.txt

# Run the monitor
python home-automation/scripts/wifi_monitor.py --mqtt --mqtt-broker localhost
```

## 📁 What's Included

| Component | Purpose | Location |
|-----------|---------|----------|
| `docker-compose.home.yml` | Full deployment stack | Root |
| `home-assistant/` | HA configuration & automations | `home-assistant/` |
| `scripts/` | Python monitoring tools | `scripts/` |
| `esp32/` | ESP32 hardware setup guide | `esp32/` |

## 🏠 Home Use Cases

### 1. Auto Lights (No Hardware Needed)

Uses your existing WiFi router's RSSI data:

```yaml
# Add to Home Assistant configuration.yaml
sensor:
  - platform: rest
    name: "WiFi Motion Level"
    resource: http://localhost:3000/api/v1/sensing/latest
    value_template: "{{ value_json.motion_level }}"
```

### 2. Sleep Monitoring (~$16)

2x ESP32-S3 nodes in bedroom:
- Breathing rate tracking
- Sleep quality analysis
- Night wandering alerts

```bash
# Start with logging
docker compose --profile logging up -d

# View sleep data in Grafana
open http://localhost:3002
```

### 3. Elderly Care System (~$24)

3x ESP32-S3 nodes covering living areas:
- Fall detection
- Abnormal breathing alerts
- Daily activity reports

```bash
python home-automation/scripts/wifi_monitor.py \
  --mqtt --mqtt-broker homeassistant.local \
  --webhook https://your-alerts.com/webhook
```

### 4. Whole-Home Automation (~$48)

6x ESP32-S3 mesh network:
- Room-level presence
- HVAC optimization (15-30% energy savings)
- Security mode when away

## 📊 API Endpoints

| Endpoint | Data | Use Case |
|----------|------|----------|
| `GET /api/v1/sensing/latest` | Motion level, amplitude | Presence detection |
| `GET /api/v1/vital-signs` | Breathing, heart rate | Health monitoring |
| `GET /api/v1/pose/current` | 17 body keypoints | Fall detection, posture |
| `WS /ws/sensing` | Real-time stream | Live automations |

## 🔧 Hardware Setup

### For Full CSI (Recommended)

1. **Buy hardware**: 2-3x ESP32-S3-DevKitC-1 (~$8 each)
2. **Flash firmware**: See `esp32/SETUP.md`
3. **Place nodes**: 2-5m apart, waist height
4. **Run server**: `docker compose up -d`

### For Basic Presence (Free)

Uses existing WiFi - just run the Docker container.

## 🏡 Home Assistant Integration

1. Copy `home-assistant/configuration.yaml` snippets to your HA config
2. Restart Home Assistant
3. New entities will appear:
   - `sensor.wifi_breathing_rate`
   - `sensor.wifi_motion_level`
   - `binary_sensor.wifi_room_occupied`

### Automations Included

- **Auto lights**: Turn on when room occupied (sunset only)
- **Sleep mode**: Lower temperature when sleep detected
- **Breathing alert**: Notify if abnormal breathing detected
- **Fall detection**: Emergency alert on sudden motion spike

## 📈 Data Logging

Enable InfluxDB + Grafana:

```bash
docker compose --profile logging up -d
```

Access Grafana at http://localhost:3002 (admin/wifisensing123)

Pre-configured dashboards:
- Room occupancy over time
- Breathing rate trends
- Motion heatmaps

## 🛠️ Customization

### Adjust Motion Sensitivity

```yaml
# Home Assistant
input_number:
  wifi_motion_threshold:
    initial: 0.2  # Increase for less sensitivity
```

### Custom Webhook Integration

```python
# Send events to any service
python home-automation/scripts/wifi_monitor.py \
  --webhook https://api.ifttt.com/v1/webhooks/your_key
```

## 🐛 Troubleshooting

### No data in UI

```bash
# Check container is running
docker ps | grep wifi-densepose

# Check logs
docker logs wifi-densepose

# Test API manually
curl http://localhost:3000/health
```

### ESP32 not connecting

1. Verify same WiFi network
2. Check firewall: `sudo ufw allow 5005/udp`
3. Test UDP: `nc -lu 5005`

### Poor accuracy

- Add more ESP32 nodes (minimum 2)
- Check distance (< 5m from subject)
- Avoid metal interference

## 📚 Next Steps

1. **Try simulated mode**: `docker compose up -d`
2. **Order ESP32s**: 2-3x ESP32-S3-DevKitC-1
3. **Flash & place**: Follow `esp32/SETUP.md`
4. **Integrate**: Add to Home Assistant
5. **Customize**: Create your own automations

## 💡 Ideas

- **Baby monitor**: No camera needed, privacy-safe
- **Pet tracker**: Detect pet movement patterns
- **Energy saver**: HVAC only in occupied rooms
- **Security**: Alert when motion detected while away
- **Sleep coach**: Track breathing for better sleep
