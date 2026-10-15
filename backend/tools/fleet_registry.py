"""Fleet Registry Tool: Machine assets layout, capability metadata, and line targets."""

from __future__ import annotations

from backend.core.config import settings
from backend.core.models import FleetAsset, FleetRegistryResponse

DEFAULT_LINE_ID = "cell-line-1"
DEFAULT_LINE_NAME = "Cell Line 1"

FLEET_ASSETS: tuple[FleetAsset, ...] = (
    FleetAsset(
        machine_id="CNC-01",
        machine_type="cnc",
        bay="Bay 2",
        part="Gearbox Casing",
        operation="Op-10 · Rough turn",
        on_demand=False,
    ),
    FleetAsset(
        machine_id="CNC-02",
        machine_type="cnc",
        bay="Bay 4",
        part="Gearbox Casing",
        operation="Op-20 · Face mill",
        on_demand=False,
    ),
    FleetAsset(
        machine_id="CNC-03",
        machine_type="cnc",
        bay="Bay 5",
        part="Gearbox Casing",
        operation="Op-30 · Drill & tap",
        on_demand=False,
    ),
    FleetAsset(
        machine_id="IM-05",
        machine_type="im",
        bay="Bay 7",
        part="Gearbox Casing",
        operation="Op-05 · Injection mould",
        on_demand=True,
    ),
)


def default_machine_ids() -> tuple[str, ...]:
    """Returns the identifiers of default (non-on-demand) machines in the cell."""
    return tuple(asset.machine_id for asset in FLEET_ASSETS if not asset.on_demand)


def get_fleet_registry() -> FleetRegistryResponse:
    """Builds the dynamic fleet registry response reflecting runtime configuration settings."""
    return FleetRegistryResponse(
        line_id=DEFAULT_LINE_ID,
        line_name=DEFAULT_LINE_NAME,
        planned_availability=settings.planned_availability,
        mttr_target_minutes=settings.mttr_target_minutes,
        oee_target=settings.oee_target,
        assets=list(FLEET_ASSETS),
    )
