"""
Mock pose data generator for testing and development.

This module provides synthetic pose estimation data for use in development
and testing environments ONLY. The generated data mimics realistic human
pose detection outputs including keypoints, bounding boxes, and activities.

WARNING: This module uses random number generation intentionally for test data.
Do NOT use this module in production data paths.
"""

import math
import random
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Banner displayed when mock pose mode is active
MOCK_POSE_BANNER = """
================================================================================
  WARNING: MOCK POSE MODE ACTIVE - Using synthetic pose data

  All pose detections are randomly generated and do NOT represent real humans.
  For real pose estimation, provide trained model weights and real CSI data.
  See docs/hardware-setup.md for configuration instructions.
================================================================================
"""

_banner_shown = False


def _show_banner() -> None:
    """Display the mock pose mode warning banner (once per session)."""
    global _banner_shown
    if not _banner_shown:
        logger.warning(MOCK_POSE_BANNER)
        _banner_shown = True


# Anatomically plausible base template for COCO 17-keypoint format.
# Coordinates are normalized (0-1) for a standing human facing the camera.
# Origin is top-left; y increases downward.
_BASE_POSE = {
    "nose":            (0.500, 0.110),
    "left_eye":        (0.515, 0.095),
    "right_eye":       (0.485, 0.095),
    "left_ear":        (0.535, 0.105),
    "right_ear":       (0.465, 0.105),
    "left_shoulder":   (0.570, 0.200),
    "right_shoulder":  (0.430, 0.200),
    "left_elbow":      (0.620, 0.340),
    "right_elbow":     (0.380, 0.340),
    "left_wrist":      (0.640, 0.470),
    "right_wrist":     (0.360, 0.470),
    "left_hip":        (0.550, 0.520),
    "right_hip":       (0.450, 0.520),
    "left_knee":       (0.560, 0.700),
    "right_knee":      (0.440, 0.700),
    "left_ankle":      (0.565, 0.880),
    "right_ankle":     (0.435, 0.880),
}

# A few activity-specific base poses for variety.
_SITTING_OFFSETS = {
    "left_knee":   (0.04, -0.12),
    "right_knee":  (-0.04, -0.12),
    "left_ankle":  (0.06, -0.06),
    "right_ankle": (-0.06, -0.06),
    "left_hip":    (0.0, -0.02),
    "right_hip":   (0.0, -0.02),
}

_WALKING_OFFSETS = {
    "left_knee":   (0.02, 0.0),
    "right_knee":  (-0.02, 0.02),
    "left_ankle":  (0.03, -0.02),
    "right_ankle": (-0.03, 0.03),
    "left_elbow":  (-0.02, 0.0),
    "right_elbow": (0.02, 0.0),
    "left_wrist":  (-0.03, -0.02),
    "right_wrist": (0.03, -0.02),
}

_ACTIVITY_OFFSETS = {
    "sitting": _SITTING_OFFSETS,
    "walking": _WALKING_OFFSETS,
}


def generate_mock_keypoints(
    center_x: float = 0.5,
    center_y: float = 0.5,
    scale: float = 1.0,
    activity: str = "standing",
    time_seed: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Generate anatomically plausible mock keypoints for a single person.

    The keypoints are based on a human body template with small random
    perturbations to simulate natural movement.

    Args:
        center_x: Horizontal center of the person (0-1).
        center_y: Vertical center of the person (0-1).
        scale: Size multiplier (1.0 = default height ~0.8 of frame).
        activity: One of standing, sitting, walking, lying.
        time_seed: Optional time value for smooth animation.

    Returns:
        List of 17 COCO-format keypoint dictionaries with name, x, y, confidence.
    """
    t = time_seed if time_seed is not None else datetime.now().timestamp()

    # Get activity offsets
    offsets = _ACTIVITY_OFFSETS.get(activity, {})

    # Breathing / idle sway animation
    sway_x = math.sin(t * 0.8) * 0.005
    sway_y = math.sin(t * 1.2) * 0.003

    keypoints = []
    for name, (bx, by) in _BASE_POSE.items():
        # Apply activity-specific offsets
        ox, oy = offsets.get(name, (0.0, 0.0))

        # Shift from default center (0.5, 0.5) to requested center and apply scale
        x = center_x + (bx - 0.5 + ox) * scale + sway_x
        y = center_y + (by - 0.5 + oy) * scale + sway_y

        # Small per-keypoint jitter for realism
        x += random.gauss(0, 0.004) * scale
        y += random.gauss(0, 0.004) * scale

        # Clamp to valid range
        x = max(0.01, min(0.99, x))
        y = max(0.01, min(0.99, y))

        # Extremities tend to have slightly lower confidence
        if "ankle" in name or "wrist" in name:
            conf = random.uniform(0.55, 0.85)
        elif "ear" in name or "eye" in name:
            conf = random.uniform(0.65, 0.90)
        else:
            conf = random.uniform(0.75, 0.95)

        keypoints.append({
            "name": name,
            "x": round(x, 4),
            "y": round(y, 4),
            "confidence": round(conf, 3),
        })

    return keypoints


def generate_mock_bounding_box(keypoints: Optional[List[Dict[str, Any]]] = None) -> Dict[str, float]:
    """Generate a mock bounding box for a single person.

    If keypoints are provided the box is derived from them; otherwise a
    random plausible box is returned.

    Returns:
        Dictionary with x, y, width, height as normalized coordinates.
    """
    if keypoints:
        xs = [kp["x"] for kp in keypoints]
        ys = [kp["y"] for kp in keypoints]
        margin = 0.03
        x = max(0.0, min(xs) - margin)
        y = max(0.0, min(ys) - margin)
        width = min(1.0 - x, max(xs) - min(xs) + 2 * margin)
        height = min(1.0 - y, max(ys) - min(ys) + 2 * margin)
        return {"x": round(x, 4), "y": round(y, 4), "width": round(width, 4), "height": round(height, 4)}

    x = random.uniform(0.1, 0.6)
    y = random.uniform(0.1, 0.6)
    width = random.uniform(0.2, 0.4)
    height = random.uniform(0.3, 0.5)
    return {"x": x, "y": y, "width": width, "height": height}


def generate_mock_poses(max_persons: int = 3) -> List[Dict[str, Any]]:
    """Generate mock pose detections for testing.

    Args:
        max_persons: Maximum number of persons to generate (1 to max_persons).

    Returns:
        List of pose detection dictionaries.
    """
    _show_banner()

    num_persons = random.randint(1, min(3, max_persons))
    poses = []

    # Spread people across the frame so they don't overlap
    positions = [
        (0.35, 0.50),
        (0.65, 0.50),
        (0.50, 0.50),
        (0.25, 0.50),
        (0.75, 0.50),
    ]

    t = datetime.now().timestamp()

    for i in range(num_persons):
        cx, cy = positions[i % len(positions)]
        # Small random drift per frame
        cx += math.sin(t * 0.3 + i * 2.0) * 0.04
        cy += math.cos(t * 0.2 + i * 1.5) * 0.02

        activity = random.choice(["standing", "sitting", "walking"])
        confidence = random.uniform(0.55, 0.95)
        scale = random.uniform(0.85, 1.05)

        keypoints = generate_mock_keypoints(
            center_x=cx,
            center_y=cy,
            scale=scale,
            activity=activity,
            time_seed=t + i * 100,
        )

        pose = {
            "person_id": i,
            "confidence": confidence,
            "keypoints": keypoints,
            "bounding_box": generate_mock_bounding_box(keypoints),
            "activity": activity,
            "timestamp": datetime.now().isoformat(),
        }

        poses.append(pose)

    return poses


def generate_mock_zone_occupancy(zone_id: str) -> Dict[str, Any]:
    """Generate mock zone occupancy data.

    Args:
        zone_id: Zone identifier.

    Returns:
        Dictionary with occupancy count and person details.
    """
    _show_banner()

    count = random.randint(0, 5)
    persons = []

    for i in range(count):
        persons.append({
            "person_id": f"person_{i}",
            "confidence": random.uniform(0.7, 0.95),
            "activity": random.choice(["standing", "sitting", "walking"]),
        })

    return {
        "count": count,
        "max_occupancy": 10,
        "persons": persons,
        "timestamp": datetime.now(),
    }


def generate_mock_zones_summary(
    zone_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generate mock zones summary data.

    Args:
        zone_ids: List of zone identifiers. Defaults to zone_1 through zone_4.

    Returns:
        Dictionary with per-zone occupancy and aggregate counts.
    """
    _show_banner()

    zones = zone_ids or ["zone_1", "zone_2", "zone_3", "zone_4"]
    zone_data = {}
    total_persons = 0
    active_zones = 0

    for zone_id in zones:
        count = random.randint(0, 3)
        zone_data[zone_id] = {
            "occupancy": count,
            "max_occupancy": 10,
            "status": "active" if count > 0 else "inactive",
        }
        total_persons += count
        if count > 0:
            active_zones += 1

    return {
        "total_persons": total_persons,
        "zones": zone_data,
        "active_zones": active_zones,
    }


def generate_mock_historical_data(
    start_time: datetime,
    end_time: datetime,
    zone_ids: Optional[List[str]] = None,
    aggregation_interval: int = 300,
    include_raw_data: bool = False,
) -> Dict[str, Any]:
    """Generate mock historical pose data.

    Args:
        start_time: Start of the time range.
        end_time: End of the time range.
        zone_ids: Zones to include. Defaults to zone_1, zone_2, zone_3.
        aggregation_interval: Seconds between data points.
        include_raw_data: Whether to include simulated raw detections.

    Returns:
        Dictionary with aggregated_data, optional raw_data, and total_records.
    """
    _show_banner()

    zones = zone_ids or ["zone_1", "zone_2", "zone_3"]
    current_time = start_time
    aggregated_data = []
    raw_data = [] if include_raw_data else None

    while current_time < end_time:
        data_point = {
            "timestamp": current_time,
            "total_persons": random.randint(0, 8),
            "zones": {},
        }

        for zone_id in zones:
            data_point["zones"][zone_id] = {
                "occupancy": random.randint(0, 3),
                "avg_confidence": random.uniform(0.7, 0.95),
            }

        aggregated_data.append(data_point)

        if include_raw_data:
            for _ in range(random.randint(0, 5)):
                raw_data.append({
                    "timestamp": current_time + timedelta(seconds=random.randint(0, aggregation_interval)),
                    "person_id": f"person_{random.randint(1, 10)}",
                    "zone_id": random.choice(zones),
                    "confidence": random.uniform(0.5, 0.95),
                    "activity": random.choice(["standing", "sitting", "walking"]),
                })

        current_time += timedelta(seconds=aggregation_interval)

    return {
        "aggregated_data": aggregated_data,
        "raw_data": raw_data,
        "total_records": len(aggregated_data),
    }


def generate_mock_recent_activities(
    zone_id: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Generate mock recent activity data.

    Args:
        zone_id: Optional zone filter. If None, random zones are used.
        limit: Number of activities to generate.

    Returns:
        List of activity dictionaries.
    """
    _show_banner()

    activities = []

    for i in range(limit):
        activity = {
            "activity_id": f"activity_{i}",
            "person_id": f"person_{random.randint(1, 5)}",
            "zone_id": zone_id or random.choice(["zone_1", "zone_2", "zone_3"]),
            "activity": random.choice(["standing", "sitting", "walking", "lying"]),
            "confidence": random.uniform(0.6, 0.95),
            "timestamp": datetime.now() - timedelta(minutes=random.randint(0, 60)),
            "duration_seconds": random.randint(10, 300),
        }
        activities.append(activity)

    return activities


def generate_mock_statistics(
    start_time: datetime,
    end_time: datetime,
) -> Dict[str, Any]:
    """Generate mock pose estimation statistics.

    Args:
        start_time: Start of the statistics period.
        end_time: End of the statistics period.

    Returns:
        Dictionary with detection counts, rates, and distributions.
    """
    _show_banner()

    total_detections = random.randint(100, 1000)
    successful_detections = int(total_detections * random.uniform(0.8, 0.95))

    return {
        "total_detections": total_detections,
        "successful_detections": successful_detections,
        "failed_detections": total_detections - successful_detections,
        "success_rate": successful_detections / total_detections,
        "average_confidence": random.uniform(0.75, 0.90),
        "average_processing_time_ms": random.uniform(50, 200),
        "unique_persons": random.randint(5, 20),
        "most_active_zone": random.choice(["zone_1", "zone_2", "zone_3"]),
        "activity_distribution": {
            "standing": random.uniform(0.3, 0.5),
            "sitting": random.uniform(0.2, 0.4),
            "walking": random.uniform(0.1, 0.3),
            "lying": random.uniform(0.0, 0.1),
        },
    }
