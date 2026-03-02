"""
Alert service for WiFi-DensePose home security system.

Monitors pose data for security-relevant events (intrusions, falls, zone violations)
and manages alert lifecycle: generation, storage, rate-limiting, and retrieval.
"""

import logging
import threading
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertType(str, Enum):
    INTRUSION = "intrusion"
    FALL_DETECTED = "fall_detected"
    ZONE_VIOLATION = "zone_violation"
    UNUSUAL_ACTIVITY = "unusual_activity"
    OCCUPANCY_CHANGE = "occupancy_change"
    SYSTEM = "system"


@dataclass
class Alert:
    id: str
    alert_type: AlertType
    severity: AlertSeverity
    zone_id: str
    title: str
    message: str
    timestamp: str
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AlertRule:
    id: str
    name: str
    alert_type: AlertType
    zone_ids: List[str]
    enabled: bool = True
    severity: AlertSeverity = AlertSeverity.WARNING
    conditions: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


ROOM_LABELS = {
    "living_room": "Living Room",
    "bedroom": "Bedroom",
    "kitchen": "Kitchen",
    "bathroom": "Bathroom",
    "hallway": "Hallway",
}


def _room_name(zone_id: str) -> str:
    return ROOM_LABELS.get(zone_id, zone_id.replace("_", " ").title())


class AlertService:
    """Manages alert generation, storage, and retrieval."""

    def __init__(self):
        self._alerts: List[Alert] = []
        self._rules: List[AlertRule] = []
        self._lock = threading.Lock()
        self._counter = 0
        self._last_alert_times: Dict[str, float] = {}
        self._cooldown_seconds = 30
        self._max_alerts = 500
        self._zone_occupancy: Dict[str, int] = {}
        self._setup_default_rules()

    def _setup_default_rules(self):
        self._rules = [
            AlertRule(
                id="rule_intrusion",
                name="Intrusion Detection",
                alert_type=AlertType.INTRUSION,
                zone_ids=["hallway", "living_room"],
                severity=AlertSeverity.CRITICAL,
                conditions={"trigger": "person_detected", "schedule": "away"},
            ),
            AlertRule(
                id="rule_fall",
                name="Fall Detection",
                alert_type=AlertType.FALL_DETECTED,
                zone_ids=["living_room", "bedroom", "kitchen", "bathroom", "hallway"],
                severity=AlertSeverity.CRITICAL,
                conditions={"activity": "falling"},
            ),
            AlertRule(
                id="rule_zone_violation",
                name="Restricted Zone",
                alert_type=AlertType.ZONE_VIOLATION,
                zone_ids=["kitchen"],
                enabled=False,
                severity=AlertSeverity.WARNING,
                conditions={"trigger": "person_detected", "schedule": "night"},
            ),
            AlertRule(
                id="rule_occupancy",
                name="Occupancy Change",
                alert_type=AlertType.OCCUPANCY_CHANGE,
                zone_ids=["living_room", "bedroom", "kitchen", "bathroom", "hallway"],
                severity=AlertSeverity.INFO,
                conditions={"trigger": "occupancy_change"},
            ),
        ]

    def _next_id(self) -> str:
        self._counter += 1
        return f"alert_{int(time.time())}_{self._counter}"

    def _is_rate_limited(self, key: str) -> bool:
        now = time.time()
        last = self._last_alert_times.get(key, 0)
        if now - last < self._cooldown_seconds:
            return True
        self._last_alert_times[key] = now
        return False

    def evaluate_pose_data(self, pose_data: Dict[str, Any]) -> List[Alert]:
        """Evaluate pose data against active rules, generating alerts as needed."""
        new_alerts = []
        persons = pose_data.get("persons", [])
        zone_id = pose_data.get("zone_id", "unknown")
        person_count = len(persons)

        for rule in self._rules:
            if not rule.enabled:
                continue
            if zone_id not in rule.zone_ids and "*" not in rule.zone_ids:
                continue

            rate_key = f"{rule.id}:{zone_id}"

            if rule.alert_type == AlertType.FALL_DETECTED:
                for person in persons:
                    activity = person.get("activity", "")
                    if activity == "falling":
                        if self._is_rate_limited(rate_key):
                            continue
                        alert = Alert(
                            id=self._next_id(),
                            alert_type=AlertType.FALL_DETECTED,
                            severity=AlertSeverity.CRITICAL,
                            zone_id=zone_id,
                            title="Fall Detected",
                            message=f"Person {person.get('person_id', '?')} appears to have fallen in {_room_name(zone_id)}",
                            timestamp=datetime.utcnow().isoformat(),
                            metadata={"person_id": person.get("person_id"), "confidence": person.get("confidence")},
                        )
                        new_alerts.append(alert)

            elif rule.alert_type == AlertType.OCCUPANCY_CHANGE:
                prev = self._zone_occupancy.get(zone_id, 0)
                if person_count != prev:
                    if not self._is_rate_limited(rate_key):
                        direction = "entered" if person_count > prev else "left"
                        alert = Alert(
                            id=self._next_id(),
                            alert_type=AlertType.OCCUPANCY_CHANGE,
                            severity=AlertSeverity.INFO,
                            zone_id=zone_id,
                            title="Occupancy Change",
                            message=f"Person {direction} {_room_name(zone_id)} ({prev} -> {person_count})",
                            timestamp=datetime.utcnow().isoformat(),
                            metadata={"previous": prev, "current": person_count},
                        )
                        new_alerts.append(alert)
                    self._zone_occupancy[zone_id] = person_count

            elif rule.alert_type == AlertType.INTRUSION:
                if person_count > 0:
                    if not self._is_rate_limited(rate_key):
                        alert = Alert(
                            id=self._next_id(),
                            alert_type=AlertType.INTRUSION,
                            severity=AlertSeverity.CRITICAL,
                            zone_id=zone_id,
                            title="Intrusion Detected",
                            message=f"{person_count} person(s) detected in {_room_name(zone_id)}",
                            timestamp=datetime.utcnow().isoformat(),
                            metadata={"person_count": person_count},
                        )
                        new_alerts.append(alert)

        with self._lock:
            self._alerts.extend(new_alerts)
            if len(self._alerts) > self._max_alerts:
                self._alerts = self._alerts[-self._max_alerts:]

        return new_alerts

    def get_alerts(
        self,
        limit: int = 50,
        offset: int = 0,
        severity: Optional[str] = None,
        alert_type: Optional[str] = None,
        zone_id: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            filtered = list(reversed(self._alerts))

        if severity:
            filtered = [a for a in filtered if a.severity == severity]
        if alert_type:
            filtered = [a for a in filtered if a.alert_type == alert_type]
        if zone_id:
            filtered = [a for a in filtered if a.zone_id == zone_id]
        if acknowledged is not None:
            filtered = [a for a in filtered if a.acknowledged == acknowledged]

        total = len(filtered)
        page = filtered[offset: offset + limit]

        return {
            "alerts": [a.to_dict() for a in page],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def acknowledge_alert(self, alert_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.acknowledged = True
                    alert.acknowledged_at = datetime.utcnow().isoformat()
                    return alert.to_dict()
        return None

    def acknowledge_all(self) -> int:
        count = 0
        now = datetime.utcnow().isoformat()
        with self._lock:
            for alert in self._alerts:
                if not alert.acknowledged:
                    alert.acknowledged = True
                    alert.acknowledged_at = now
                    count += 1
        return count

    def clear_alerts(self) -> int:
        with self._lock:
            count = len(self._alerts)
            self._alerts.clear()
        return count

    def get_rules(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self._rules]

    def update_rule(self, rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for rule in self._rules:
            if rule.id == rule_id:
                if "enabled" in updates:
                    rule.enabled = updates["enabled"]
                if "severity" in updates:
                    rule.severity = AlertSeverity(updates["severity"])
                if "zone_ids" in updates:
                    rule.zone_ids = updates["zone_ids"]
                if "conditions" in updates:
                    rule.conditions.update(updates["conditions"])
                return rule.to_dict()
        return None

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._alerts)
            unacknowledged = sum(1 for a in self._alerts if not a.acknowledged)
            by_severity = {}
            by_type = {}
            for a in self._alerts:
                by_severity[a.severity] = by_severity.get(a.severity, 0) + 1
                by_type[a.alert_type] = by_type.get(a.alert_type, 0) + 1

        return {
            "total": total,
            "unacknowledged": unacknowledged,
            "by_severity": by_severity,
            "by_type": by_type,
            "rules_active": sum(1 for r in self._rules if r.enabled),
            "rules_total": len(self._rules),
        }


_alert_service: Optional[AlertService] = None


def get_alert_service() -> AlertService:
    global _alert_service
    if _alert_service is None:
        _alert_service = AlertService()
    return _alert_service
