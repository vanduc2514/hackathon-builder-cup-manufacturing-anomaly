"""Unit tests for Fleet Registry tool and machine simulator synchronization."""

from __future__ import annotations

import pytest

from backend.core.config import settings
from backend.core.models import FleetRegistryResponse
from backend.tools.fleet_registry import (
    DEFAULT_LINE_ID,
    DEFAULT_LINE_NAME,
    FLEET_ASSETS,
    default_machine_ids,
    get_fleet_registry,
)
from simulator.machine_simulator import MachineSimulator


def test_get_fleet_registry_structure_and_defaults():
    """Verify get_fleet_registry returns a valid FleetRegistryResponse matching settings."""
    reg = get_fleet_registry()
    assert isinstance(reg, FleetRegistryResponse)
    assert reg.line_id == DEFAULT_LINE_ID
    assert reg.line_name == DEFAULT_LINE_NAME
    assert reg.planned_availability == settings.planned_availability
    assert reg.mttr_target_minutes == settings.mttr_target_minutes
    assert reg.oee_target == settings.oee_target
    assert len(reg.assets) == len(FLEET_ASSETS)


def test_fleet_assets_metadata():
    """Verify fleet assets have correct machine types, bays, operations, and on_demand flags."""
    reg = get_fleet_registry()
    asset_map = {a.machine_id: a for a in reg.assets}

    assert "CNC-01" in asset_map
    assert asset_map["CNC-01"].machine_type == "cnc"
    assert asset_map["CNC-01"].bay == "Bay 2"
    assert asset_map["CNC-01"].part == "Gearbox Casing"
    assert "Op-10" in asset_map["CNC-01"].operation
    assert not asset_map["CNC-01"].on_demand

    assert "CNC-02" in asset_map
    assert asset_map["CNC-02"].machine_type == "cnc"
    assert asset_map["CNC-02"].bay == "Bay 4"
    assert asset_map["CNC-02"].part == "Gearbox Casing"
    assert "Op-20" in asset_map["CNC-02"].operation
    assert not asset_map["CNC-02"].on_demand

    assert "CNC-03" in asset_map
    assert asset_map["CNC-03"].machine_type == "cnc"
    assert asset_map["CNC-03"].bay == "Bay 5"
    assert asset_map["CNC-03"].part == "Gearbox Casing"
    assert "Op-30" in asset_map["CNC-03"].operation
    assert not asset_map["CNC-03"].on_demand

    assert "IM-05" in asset_map
    assert asset_map["IM-05"].machine_type == "im"
    assert asset_map["IM-05"].bay == "Bay 7"
    assert asset_map["IM-05"].part == "Gearbox Casing"
    assert "Op-05" in asset_map["IM-05"].operation
    assert asset_map["IM-05"].on_demand is True


def test_default_machine_ids():
    """Verify default_machine_ids only returns non-on-demand assets in expected order."""
    machine_ids = default_machine_ids()
    assert machine_ids == ("CNC-01", "CNC-02", "CNC-03")
    assert "IM-05" not in machine_ids


def test_simulator_sync_guard():
    """Sync guard: verify fleet registry contains all machines defined in MachineSimulator."""
    sim = MachineSimulator(include_im=True)
    sim_machines = set(sim.machines_meta.keys())

    reg = get_fleet_registry()
    registry_ids = {a.machine_id for a in reg.assets}

    # Registry must be a superset of simulator machines
    assert sim_machines.issubset(registry_ids), (
        f"Fleet registry {registry_ids} does not contain all simulator machines {sim_machines}"
    )


def test_dynamic_settings_reflection(monkeypatch: pytest.MonkeyPatch):
    """Verify get_fleet_registry reads targets from settings dynamically at runtime."""
    monkeypatch.setattr(settings, "planned_availability", 0.95)
    monkeypatch.setattr(settings, "mttr_target_minutes", 20)
    monkeypatch.setattr(settings, "oee_target", 0.90)

    reg = get_fleet_registry()
    assert reg.planned_availability == 0.95
    assert reg.mttr_target_minutes == 20
    assert reg.oee_target == 0.90
