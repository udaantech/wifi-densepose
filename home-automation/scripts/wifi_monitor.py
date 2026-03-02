#!/usr/bin/env python3
"""
WiFi DensePose Home Monitor

Monitors WiFi sensing data and triggers home automation actions.
Can be run standalone or as a Home Assistant add-on.

Usage:
    python wifi_monitor.py                    # Run with default settings
    python wifi_monitor.py --mqtt             # Publish to MQTT
    python wifi_monitor.py --webhook URL      # Send to webhook
    python wifi_monitor.py --influx           # Log to InfluxDB
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass
from typing import Optional, Callable

import aiohttp
import websockets

# Optional imports for different backends
try:
    import paho.mqtt.publish as mqtt_publish
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False

try:
    from influxdb_client import InfluxDBClient, Point
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUX_AVAILABLE = True
except ImportError:
    INFLUX_AVAILABLE = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class SensingData:
    """Parsed sensing data from WiFi DensePose."""
    timestamp: float
    persons: int
    motion_level: float
    breathing_bpm: Optional[float]
    heart_bpm: Optional[float]
    breathing_confidence: float
    heart_confidence: float


class WiFiHomeMonitor:
    """Monitor WiFi DensePose and trigger automations."""
    
    def __init__(
        self,
        ws_url: str = "ws://localhost:3001/ws/sensing",
        rest_url: str = "http://localhost:3000",
        motion_threshold: float = 0.2,
        presence_timeout: float = 300,  # 5 minutes
    ):
        self.ws_url = ws_url
        self.rest_url = rest_url
        self.motion_threshold = motion_threshold
        self.presence_timeout = presence_timeout
        
        self._last_presence = time.time()
        self._is_present = False
        self._callbacks: list[Callable] = []
        
        # Statistics
        self._breathing_history: list[float] = []
        self._motion_history: list[float] = []
    
    def on_event(self, callback: Callable):
        """Register a callback for sensing events."""
        self._callbacks.append(callback)
        return callback
    
    def _trigger(self, event_type: str, data: dict):
        """Trigger all registered callbacks."""
        for callback in self._callbacks:
            try:
                callback(event_type, data)
            except Exception as e:
                logger.error(f"Callback error: {e}")
    
    def _parse_data(self, message: str) -> Optional[SensingData]:
        """Parse WebSocket message into SensingData."""
        try:
            data = json.loads(message)
            vitals = data.get('vital_signs', {})
            
            return SensingData(
                timestamp=time.time(),
                persons=len(data.get('persons', [])),
                motion_level=data.get('motion_level', 0),
                breathing_bpm=vitals.get('breathing_bpm'),
                heart_bpm=vitals.get('heart_bpm'),
                breathing_confidence=vitals.get('breathing_confidence', 0),
                heart_confidence=vitals.get('heart_confidence', 0),
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse message: {e}")
            return None
    
    def _process_data(self, data: SensingData):
        """Process sensing data and detect events."""
        # Update presence detection
        is_moving = data.motion_level > self.motion_threshold
        is_person = data.persons > 0
        
        if is_moving or is_person:
            self._last_presence = time.time()
            if not self._is_present:
                self._is_present = True
                self._trigger('presence_on', {
                    'persons': data.persons,
                    'motion_level': data.motion_level,
                })
                logger.info(f"👤 Presence detected: {data.persons} person(s)")
        else:
            time_since_presence = time.time() - self._last_presence
            if self._is_present and time_since_presence > self.presence_timeout:
                self._is_present = False
                self._trigger('presence_off', {
                    'empty_for': time_since_presence,
                })
                logger.info(f"👋 Room empty for {time_since_presence:.0f}s")
        
        # Breathing monitoring
        if data.breathing_bpm and data.breathing_confidence > 0.5:
            self._breathing_history.append(data.breathing_bpm)
            if len(self._breathing_history) > 60:
                self._breathing_history.pop(0)
            
            # Detect abnormal breathing
            if data.breathing_bpm < 6 or data.breathing_bpm > 30:
                self._trigger('breathing_alert', {
                    'bpm': data.breathing_bpm,
                    'confidence': data.breathing_confidence,
                })
                logger.warning(f"⚠️ Abnormal breathing: {data.breathing_bpm:.1f} BPM")
        
        # Fall detection (simplified - high motion spike)
        if len(self._motion_history) > 5:
            recent_motion = self._motion_history[-5:]
            if max(recent_motion) > 0.8 and data.persons > 0:
                self._trigger('possible_fall', {
                    'motion_spike': max(recent_motion),
                })
                logger.warning("🚨 Possible fall detected!")
        
        self._motion_history.append(data.motion_level)
        if len(self._motion_history) > 100:
            self._motion_history.pop(0)
    
    async def run_websocket(self):
        """Main WebSocket loop."""
        logger.info(f"Connecting to {self.ws_url}...")
        
        while True:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    logger.info("✅ Connected to WiFi DensePose")
                    
                    async for message in ws:
                        data = self._parse_data(message)
                        if data:
                            self._process_data(data)
                            
            except websockets.exceptions.ConnectionClosed:
                logger.warning("Connection lost, reconnecting in 5s...")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                await asyncio.sleep(5)
    
    async def run_rest_polling(self, interval: float = 2.0):
        """Alternative: Poll REST API instead of WebSocket."""
        logger.info(f"Polling {self.rest_url} every {interval}s...")
        
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.get(f"{self.rest_url}/api/v1/sensing/latest") as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            # Convert to SensingData format
                            vitals_url = f"{self.rest_url}/api/v1/vital-signs"
                            async with session.get(vitals_url) as vitals_resp:
                                vitals = await vitals_resp.json() if vitals_resp.status == 200 else {}
                            
                            sensing_data = SensingData(
                                timestamp=time.time(),
                                persons=data.get('persons', 0),
                                motion_level=data.get('motion_level', 0),
                                breathing_bpm=vitals.get('breathing_bpm'),
                                heart_bpm=vitals.get('heart_bpm'),
                                breathing_confidence=vitals.get('breathing_confidence', 0),
                                heart_confidence=vitals.get('heart_confidence', 0),
                            )
                            self._process_data(sensing_data)
                        
                except Exception as e:
                    logger.error(f"Polling error: {e}")
                
                await asyncio.sleep(interval)


class MQTTBackend:
    """MQTT backend for Home Assistant integration."""
    
    def __init__(self, broker: str, port: int = 1883, topic_prefix: str = "wifi-densepose"):
        self.broker = broker
        self.port = port
        self.topic_prefix = topic_prefix
    
    def publish(self, event_type: str, data: dict):
        """Publish event to MQTT."""
        if not MQTT_AVAILABLE:
            logger.error("MQTT not available. Install: pip install paho-mqtt")
            return
        
        topic = f"{self.topic_prefix}/event/{event_type}"
        payload = json.dumps(data)
        
        try:
            mqtt_publish.single(
                topic,
                payload,
                hostname=self.broker,
                port=self.port,
            )
            logger.debug(f"Published to MQTT: {topic}")
        except Exception as e:
            logger.error(f"MQTT publish failed: {e}")


class InfluxBackend:
    """InfluxDB backend for data logging."""
    
    def __init__(self, url: str, token: str, org: str, bucket: str):
        self.client = InfluxDBClient(url=url, token=token, org=org)
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.bucket = bucket
        self.org = org
    
    def log(self, event_type: str, data: dict):
        """Log event to InfluxDB."""
        point = Point("wifi_sensing").tag("event", event_type)
        
        for key, value in data.items():
            if isinstance(value, (int, float)):
                point = point.field(key, value)
        
        try:
            self.write_api.write(bucket=self.bucket, org=self.org, record=point)
        except Exception as e:
            logger.error(f"InfluxDB write failed: {e}")


class WebhookBackend:
    """Webhook backend for custom integrations."""
    
    def __init__(self, url: str):
        self.url = url
    
    async def send(self, event_type: str, data: dict):
        """Send event to webhook."""
        payload = {
            'event': event_type,
            'timestamp': time.time(),
            'data': data,
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.url, json=payload) as resp:
                    if resp.status >= 400:
                        logger.error(f"Webhook error: {resp.status}")
        except Exception as e:
            logger.error(f"Webhook failed: {e}")


def main():
    parser = argparse.ArgumentParser(description='WiFi DensePose Home Monitor')
    parser.add_argument('--ws-url', default='ws://localhost:3001/ws/sensing',
                        help='WebSocket URL')
    parser.add_argument('--rest-url', default='http://localhost:3000',
                        help='REST API URL')
    parser.add_argument('--poll', action='store_true',
                        help='Use REST polling instead of WebSocket')
    parser.add_argument('--motion-threshold', type=float, default=0.2,
                        help='Motion detection threshold (0-1)')
    parser.add_argument('--timeout', type=float, default=300,
                        help='Presence timeout in seconds')
    
    # MQTT options
    parser.add_argument('--mqtt', action='store_true',
                        help='Enable MQTT output')
    parser.add_argument('--mqtt-broker', default='localhost',
                        help='MQTT broker address')
    parser.add_argument('--mqtt-port', type=int, default=1883,
                        help='MQTT broker port')
    
    # InfluxDB options
    parser.add_argument('--influx', action='store_true',
                        help='Enable InfluxDB logging')
    parser.add_argument('--influx-url', default='http://localhost:8086',
                        help='InfluxDB URL')
    parser.add_argument('--influx-token', default='',
                        help='InfluxDB token')
    parser.add_argument('--influx-org', default='home',
                        help='InfluxDB organization')
    parser.add_argument('--influx-bucket', default='wifi_sensing',
                        help='InfluxDB bucket')
    
    # Webhook options
    parser.add_argument('--webhook', default='',
                        help='Webhook URL for events')
    
    args = parser.parse_args()
    
    # Create monitor
    monitor = WiFiHomeMonitor(
        ws_url=args.ws_url,
        rest_url=args.rest_url,
        motion_threshold=args.motion_threshold,
        presence_timeout=args.timeout,
    )
    
    # Add backends
    if args.mqtt:
        mqtt = MQTTBackend(args.mqtt_broker, args.mqtt_port)
        monitor.on_event(mqtt.publish)
        logger.info(f"MQTT enabled: {args.mqtt_broker}:{args.mqtt_port}")
    
    if args.influx and INFLUX_AVAILABLE:
        influx = InfluxBackend(
            args.influx_url,
            args.influx_token,
            args.influx_org,
            args.influx_bucket,
        )
        monitor.on_event(influx.log)
        logger.info(f"InfluxDB enabled: {args.influx_url}")
    
    if args.webhook:
        webhook = WebhookBackend(args.webhook)
        monitor.on_event(lambda et, d: asyncio.create_task(webhook.send(et, d)))
        logger.info(f"Webhook enabled: {args.webhook}")
    
    # Add console output
    def console_output(event_type, data):
        if event_type in ['presence_on', 'presence_off', 'breathing_alert', 'possible_fall']:
            print(f"[{time.strftime('%H:%M:%S')}] {event_type}: {data}")
    
    monitor.on_event(console_output)
    
    # Run
    try:
        if args.poll:
            asyncio.run(monitor.run_rest_polling())
        else:
            asyncio.run(monitor.run_websocket())
    except KeyboardInterrupt:
        logger.info("Shutting down...")


if __name__ == '__main__':
    main()
