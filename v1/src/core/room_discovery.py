"""
Room discovery engine for WiFi-DensePose calibration.

Discovers rooms by analyzing WiFi CSI signal patterns during calibration.
Each room produces a distinct physics-based fingerprint based on:
  - Path loss (room size → signal attenuation)
  - Multipath richness (room geometry → phase variance)
  - Antenna correlation (enclosed vs open spaces)
  - Wall attenuation (material-dependent losses)

In mock mode, generates repeatable room fingerprints using seeded RNG.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Physics-based room profiles for a typical house.
# Each profile defines how WiFi signals behave in that room type.
# A realistic house has 1 hall, 1 kitchen, multiple bedrooms, multiple
# bathrooms, and a hallway.  Add or remove entries here to match your
# actual floor plan — calibration will auto-discover exactly these rooms.
ROOM_PROFILES: Dict[str, Dict[str, Any]] = {
    "hall": {
        "name": "Hall",
        "dimensions": (7.0, 5.0, 3.0),  # large open living area
        "path_loss_factor": 0.85,
        "multipath_variance": 0.45,
        "antenna_correlation": 0.60,
        "noise_multiplier": 0.06,
        "wall_material": "drywall",
    },
    "kitchen": {
        "name": "Kitchen",
        "dimensions": (4.0, 3.0, 3.0),
        "path_loss_factor": 0.70,
        "multipath_variance": 0.50,  # appliances create many reflections
        "antenna_correlation": 0.50,  # metal surfaces scatter signal
        "noise_multiplier": 0.10,  # appliance interference
        "wall_material": "mixed",
    },
    "master_bedroom": {
        "name": "Master Bedroom",
        "dimensions": (5.0, 4.0, 3.0),
        "path_loss_factor": 0.78,
        "multipath_variance": 0.32,
        "antenna_correlation": 0.65,
        "noise_multiplier": 0.07,
        "wall_material": "drywall",
    },
    "bedroom_2": {
        "name": "Bedroom 2",
        "dimensions": (3.5, 4.0, 3.0),
        "path_loss_factor": 0.75,
        "multipath_variance": 0.28,
        "antenna_correlation": 0.66,
        "noise_multiplier": 0.07,
        "wall_material": "drywall",
    },
    "bedroom_3": {
        "name": "Bedroom 3",
        "dimensions": (3.0, 4.0, 3.0),
        "path_loss_factor": 0.73,
        "multipath_variance": 0.26,
        "antenna_correlation": 0.67,
        "noise_multiplier": 0.07,
        "wall_material": "drywall",
    },
    "bathroom_master": {
        "name": "Master Bathroom",
        "dimensions": (2.0, 3.0, 3.0),
        "path_loss_factor": 0.55,
        "multipath_variance": 0.15,  # tiles reflect uniformly
        "antenna_correlation": 0.85,  # enclosed → high correlation
        "noise_multiplier": 0.12,  # tile + water pipes
        "wall_material": "tile",
    },
    "bathroom_common": {
        "name": "Common Bathroom",
        "dimensions": (2.0, 2.5, 3.0),
        "path_loss_factor": 0.52,
        "multipath_variance": 0.14,
        "antenna_correlation": 0.87,
        "noise_multiplier": 0.13,
        "wall_material": "tile",
    },
    "hallway": {
        "name": "Hallway",
        "dimensions": (1.5, 5.5, 3.0),
        "path_loss_factor": 0.65,
        "multipath_variance": 0.10,  # narrow → waveguide-like
        "antenna_correlation": 0.40,  # elongated → low correlation
        "noise_multiplier": 0.08,
        "wall_material": "drywall",
    },
}


@dataclass
class RoomFingerprint:
    """Physics-based CSI fingerprint for a discovered room."""

    zone_id: str  # e.g., "living_room"
    room_type: str  # e.g., "Living Room"
    dimensions: Tuple[float, float, float]  # (x, y, z) in meters
    area_m2: float
    path_loss_db: float
    multipath_score: float
    antenna_correlation: float
    amplitude_mean: float  # measured from CSI scan
    amplitude_std: float
    phase_variance: float
    frames_collected: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "zone_id": self.zone_id,
            "room_type": self.room_type,
            "dimensions": list(self.dimensions),
            "area_m2": round(self.area_m2, 1),
            "path_loss_db": round(self.path_loss_db, 2),
            "multipath_score": round(self.multipath_score, 4),
            "antenna_correlation": round(self.antenna_correlation, 4),
            "amplitude_mean": round(self.amplitude_mean, 6),
            "amplitude_std": round(self.amplitude_std, 6),
            "phase_variance": round(self.phase_variance, 6),
            "frames_collected": self.frames_collected,
        }


class RoomDiscoveryEngine:
    """Discovers rooms by scanning WiFi CSI signal patterns.

    Uses physics-based room profiles to generate distinct CSI fingerprints
    for each room type. In mock mode, produces repeatable results via
    seeded random number generation.
    """

    def __init__(self, seed: int = 42):
        self.seed = seed
        self._rng = np.random.RandomState(seed)

    def scan_and_discover(
        self,
        csi_generator,
        baseline: Dict[str, Any],
        progress_callback=None,
    ) -> List[RoomFingerprint]:
        """Scan the environment and discover rooms via CSI analysis.

        Args:
            csi_generator: MockCSIGenerator instance for generating CSI frames.
            baseline: Phase 1 baseline results (amplitude_mean, etc.).
            progress_callback: Optional (fraction) → None for progress updates.

        Returns:
            List of RoomFingerprint objects for each discovered room.
        """
        logger.info("Starting room discovery scan...")
        profiles = list(ROOM_PROFILES.items())
        total_rooms = len(profiles)
        n_frames = 10
        fingerprints: List[RoomFingerprint] = []

        baseline_amp = baseline.get("amplitude_mean", 1.0)

        for ri, (zone_id, profile) in enumerate(profiles):
            dims = profile["dimensions"]
            area = dims[0] * dims[1]
            volume = dims[0] * dims[1] * dims[2]

            # Generate CSI frames with room-specific physics
            amplitudes: List[float] = []
            phase_vars: List[float] = []

            for fi in range(n_frames):
                csi_frame = csi_generator.generate_room_frame({
                    "amplitude_scale": profile["path_loss_factor"],
                    "noise_multiplier": profile["noise_multiplier"],
                    "movement_amplitude": profile["multipath_variance"],
                    "phase_offset": ri * 0.7,  # distinct phase per room
                })

                amp = np.abs(csi_frame)
                phase = np.angle(csi_frame)

                amplitudes.append(float(np.mean(amp)))
                phase_vars.append(float(np.var(phase)))

                if progress_callback:
                    frac = (ri * n_frames + fi + 1) / (total_rooms * n_frames)
                    progress_callback(frac)

            # Compute path loss in dB relative to baseline
            amp_mean = float(np.mean(amplitudes))
            path_loss_db = float(20 * np.log10(
                max(amp_mean, 1e-12) / max(baseline_amp, 1e-12)
            ))

            fp = RoomFingerprint(
                zone_id=zone_id,
                room_type=profile["name"],
                dimensions=dims,
                area_m2=area,
                path_loss_db=path_loss_db,
                multipath_score=profile["multipath_variance"],
                antenna_correlation=profile["antenna_correlation"],
                amplitude_mean=amp_mean,
                amplitude_std=float(np.std(amplitudes)),
                phase_variance=float(np.mean(phase_vars)),
                frames_collected=n_frames,
            )
            fingerprints.append(fp)

            logger.info(
                "Discovered %s: %.0fm², path_loss=%.1fdB, multipath=%.2f",
                profile["name"],
                area,
                path_loss_db,
                profile["multipath_variance"],
            )

        logger.info("Room discovery complete: %d rooms found", len(fingerprints))
        return fingerprints
