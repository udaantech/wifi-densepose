"""
Alert API endpoints for WiFi-DensePose home security system.
"""

import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.services.alert_service import get_alert_service

logger = logging.getLogger(__name__)
router = APIRouter()


class AcknowledgeRequest(BaseModel):
    alert_id: str = Field(..., description="Alert ID to acknowledge")


class RuleUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    severity: Optional[str] = None
    zone_ids: Optional[list] = None
    conditions: Optional[Dict[str, Any]] = None


@router.get("/")
async def get_alerts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    severity: Optional[str] = Query(None),
    alert_type: Optional[str] = Query(None),
    zone_id: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(None),
):
    """Get alerts with optional filtering."""
    service = get_alert_service()
    return service.get_alerts(
        limit=limit,
        offset=offset,
        severity=severity,
        alert_type=alert_type,
        zone_id=zone_id,
        acknowledged=acknowledged,
    )


@router.get("/summary")
async def get_alert_summary():
    """Get alert summary with counts by severity and type."""
    service = get_alert_service()
    return service.get_summary()


@router.post("/acknowledge/{alert_id}")
async def acknowledge_alert(alert_id: str):
    """Acknowledge a single alert."""
    service = get_alert_service()
    result = service.acknowledge_alert(alert_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return result


@router.post("/acknowledge-all")
async def acknowledge_all_alerts():
    """Acknowledge all unacknowledged alerts."""
    service = get_alert_service()
    count = service.acknowledge_all()
    return {"acknowledged": count}


@router.delete("/clear")
async def clear_alerts():
    """Clear all alerts."""
    service = get_alert_service()
    count = service.clear_alerts()
    return {"cleared": count}


@router.get("/rules")
async def get_alert_rules():
    """Get all alert rules."""
    service = get_alert_service()
    return {"rules": service.get_rules()}


@router.put("/rules/{rule_id}")
async def update_alert_rule(rule_id: str, update: RuleUpdateRequest):
    """Update an alert rule."""
    service = get_alert_service()
    result = service.update_rule(rule_id, update.dict(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return result


@router.post("/evaluate")
async def evaluate_pose_data(pose_data: Dict[str, Any]):
    """Manually evaluate pose data against alert rules (for testing)."""
    service = get_alert_service()
    new_alerts = service.evaluate_pose_data(pose_data)
    return {"new_alerts": [a.to_dict() for a in new_alerts], "count": len(new_alerts)}
