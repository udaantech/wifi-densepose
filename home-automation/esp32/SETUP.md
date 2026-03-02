# ESP32-S3 Setup for Home WiFi Sensing

## Hardware Needed

| Item | Qty | Price | Link/Notes |
|------|-----|-------|------------|
| ESP32-S3-DevKitC-1 | 2-3 | ~$8 each | Amazon/AliExpress |
| USB-C cables | 2-3 | - | For flashing |
| 5V USB power adapters | 2-3 | - | For permanent install |

## Quick Setup

### 1. Install esptool

```bash
pip install esptool
```

### 2. Download Firmware

Download the pre-built firmware from the releases page:
- `bootloader.bin`
- `partition-table.bin`
- `esp32-csi-node.bin`

Or build from source (see `firmware/esp32-csi-node/`).

### 3. Flash the ESP32

Connect ESP32 via USB and run:

```bash
# Linux/Mac
python -m esptool --chip esp32s3 --port /dev/ttyUSB0 --baud 460800 \
  write-flash --flash-mode dio --flash-size 4MB \
  0x0 bootloader.bin \
  0x8000 partition-table.bin \
  0x10000 esp32-csi-node.bin

# Windows (check Device Manager for COM port)
python -m esptool --chip esp32s3 --port COM7 --baud 460800 \
  write-flash --flash-mode dio --flash-size 4MB \
  0x0 bootloader.bin \
  0x8000 partition-table.bin \
  0x10000 esp32-csi-node.bin
```

### 4. Provision WiFi

```bash
python scripts/provision.py --port /dev/ttyUSB0 \
  --ssid "YOUR_WIFI_NAME" \
  --password "YOUR_WIFI_PASSWORD" \
  --target-ip "192.168.1.100"  # IP of your sensing server
```

### 5. Placement Guide

For a typical home setup:

```
        [Router/AP]
             |
    +--------+--------+
    |                 |
[ESP32 #1]        [ESP32 #2]
Living Room       Bedroom
(3m apart)        
    \               /
     \             /
      \           /
       [Coverage Area]
        ~5m radius
```

**Optimal placement:**
- 2-5 meters apart for good triangulation
- 1-2 meters high (waist to chest level)
- Clear line of sight to main activity areas
- Away from metal objects/microwave ovens

### 6. Start Sensing Server

```bash
# Docker
docker run -p 3000:3000 -p 3001:3001 -p 5005:5005/udp \
  ruvnet/wifi-densepose:latest --source esp32

# Or from source
./target/release/sensing-server \
  --source esp32 \
  --udp-port 5005 \
  --http-port 3000 \
  --ws-port 3001
```

## Multiple ESP32 Nodes

For multi-room coverage, flash each ESP32 with the same firmware but provision them to the same target IP:

```bash
# ESP32 #1 - Living Room
python scripts/provision.py --port COM7 \
  --ssid "HomeWiFi" --password "password" \
  --target-ip "192.168.1.100" --node-id "living-room"

# ESP32 #2 - Bedroom
python scripts/provision.py --port COM8 \
  --ssid "HomeWiFi" --password "password" \
  --target-ip "192.168.1.100" --node-id "bedroom"
```

## Troubleshooting

### No data arriving

1. Check ESP32 is on same WiFi network as server
2. Verify UDP port 5005 is open:
   ```bash
   sudo ufw allow 5005/udp  # Ubuntu
   ```
3. Test with netcat:
   ```bash
   nc -lu 5005  # Should show binary data
   ```

### Poor detection accuracy

- Add more ESP32 nodes (minimum 2, recommended 3+)
- Check for interference (microwave, baby monitors)
- Ensure subjects are within 5m of at least one node

### ESP32 keeps disconnecting

- Check power supply (use 1A+ adapter)
- Reduce WiFi traffic on same channel
- Enable WiFi power save mode (see firmware config)

## Advanced: Custom Firmware

To modify the firmware (e.g., change sampling rate):

```bash
cd firmware/esp32-csi-node/

# Edit sdkconfig for custom settings
# CONFIG_ESP32_WIFI_CSI_ENABLED=y
# CONFIG_ESP32_WIFI_DYNAMIC_RX_BUFFER_NUM=64

# Build
idf.py build

# Flash
idf.py flash
```

## Home Automation Integration

Once ESP32 nodes are streaming data, use the monitoring script:

```bash
# Basic monitoring
python home-automation/scripts/wifi_monitor.py

# With MQTT for Home Assistant
python home-automation/scripts/wifi_monitor.py \
  --mqtt --mqtt-broker homeassistant.local

# With data logging
python home-automation/scripts/wifi_monitor.py \
  --influx --influx-url http://localhost:8086 \
  --influx-token YOUR_TOKEN
```
