"""Tests for Edge Gateway, vision classification, noise filtering, and Pub/Sub dispatch under simulator/."""

from __future__ import annotations

import ast
from pathlib import Path

from simulator.edge import (
    EdgeAlertSpool,
    EdgeClassifierMode,
    EdgeInspectionStation,
    EdgeNoiseFilter,
    EdgePubSubDispatcher,
    GemmaEdgeClassifier,
)
from simulator.main import FactorySimulatorService
from simulator.models import (
    ConveyorPart,
    FilteredFramePacket,
    MachineTelemetry,
    MachineTelemetryPayload,
    QualityEventPayload,
    TraceabilityEventPayload,
)


def test_edge_classifier_heuristic_evaluations() -> None:
    """Verifies deterministic heuristic classification across normal parts and defects."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.HEURISTIC)

    # 1. Normal PASS part
    pass_part = ConveyorPart(
        product_id="PRD-101",
        machine_id="CNC-01",
        tool_id="T04",
        status="PASS",
    )
    res_pass = classifier.classify_frame(pass_part)
    assert not res_pass.is_defect
    assert res_pass.defect_type is None
    assert res_pass.confidence >= 0.95
    assert res_pass.bounding_box is None
    assert not res_pass.diverter_actuated

    # 2. Scratch defect part
    defect_part = ConveyorPart(
        product_id="PRD-102",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT_SCRATCH",
        defect_type="scratch_vertical",
    )
    res_defect = classifier.classify_frame(defect_part)
    assert res_defect.is_defect
    assert res_defect.defect_type == "scratch_vertical"
    assert res_defect.confidence >= 0.90
    assert res_defect.bounding_box is not None
    assert res_defect.bounding_box.ymin == 0.25
    assert res_defect.diverter_actuated

    # 3. IM-05 Cavity 3 short fill signature
    cavity_part = ConveyorPart(
        product_id="PRD-103",
        machine_id="IM-05",
        tool_id="MOLD-03",
        cavity_id=3,
        status="PASS",
    )
    res_cavity = classifier.classify_frame(cavity_part)
    assert res_cavity.is_defect
    assert res_cavity.defect_type == "short_fill"
    assert res_cavity.diverter_actuated


def test_edge_classifier_dataset_playback_mode() -> None:
    """Verifies classification by parsing MVTec AD dataset paths and inspection tokens."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.DATASET_PLAYBACK)

    part_good = ConveyorPart(
        product_id="PRD-201",
        machine_id="CNC-01",
        tool_id="T04",
        image_token="mvtec/capsule/good/005.png",
    )
    res_good = classifier.classify_frame(part_good)
    assert not res_good.is_defect

    part_scratch = ConveyorPart(
        product_id="PRD-202",
        machine_id="CNC-02",
        tool_id="T07",
        image_token="mvtec/capsule/scratch/012.png",
    )
    res_scratch = classifier.classify_frame(part_scratch)
    assert res_scratch.is_defect
    assert res_scratch.defect_type == "scratch_vertical"


def test_edge_noise_filtering_95_percent_drop_ratio() -> None:
    """Verifies that EdgeNoiseFilter drops >= 95% of normal PASS frames and forwards 100% defects."""
    noise_filter = EdgeNoiseFilter(pass_drop_ratio=0.95, confidence_threshold=0.85)
    classifier = GemmaEdgeClassifier()

    # Pass 100 normal frames
    dropped_count = 0
    forwarded_pass_count = 0
    for i in range(100):
        frame = ConveyorPart(
            product_id=f"PRD-PASS-{i}",
            machine_id="CNC-01",
            tool_id="T04",
            status="PASS",
        )
        cls_res = classifier.classify_frame(frame)
        packet = noise_filter.evaluate_frame(frame, cls_res)
        if packet.filter_decision == "DROP":
            dropped_count += 1
        else:
            forwarded_pass_count += 1

    assert dropped_count >= 95, f"Expected >= 95 dropped, got {dropped_count}"
    assert forwarded_pass_count <= 5

    # Pass 10 defect frames: 100% MUST be forwarded
    defect_forwarded_count = 0
    for i in range(10):
        frame = ConveyorPart(
            product_id=f"PRD-DEFECT-{i}",
            machine_id="CNC-02",
            tool_id="T07",
            status="DEFECT_SCRATCH",
            defect_type="scratch_vertical",
        )
        cls_res = classifier.classify_frame(frame)
        packet = noise_filter.evaluate_frame(frame, cls_res)
        if packet.filter_decision == "FORWARD":
            defect_forwarded_count += 1

    assert defect_forwarded_count == 10, "100% of defect frames must be forwarded to cloud"

    # Check cumulative statistics
    stats = noise_filter.get_statistics()
    assert stats.total_frames_evaluated == 110
    assert stats.pass_frames_dropped == dropped_count
    assert stats.defect_frames_forwarded == 10
    assert stats.cloud_bandwidth_reduction_pct >= 85.0
    assert stats.estimated_bandwidth_saved_mb > 0.0


def test_edge_alert_spool_ring_buffer() -> None:
    """Verifies edge spool ring-buffer capacity bounding and draining."""
    spool = EdgeAlertSpool(maxsize=5)
    for i in range(7):
        packet = FilteredFramePacket(
            frame_hash=f"hash-{i}",
            camera_id="CAM-01",
            product_id=f"PRD-{i}",
            machine_id="CNC-02",
            tool_id="T07",
            lot_id="AL-5083-B4",
            conveyor_timestamp="2026-10-15T10:00:00Z",
            classification="DEFECT",
            is_defect=True,
            confidence=0.96,
            uncertainty=0.04,
            filter_decision="FORWARD",
        )
        spool.append(packet)

    assert len(spool) == 5
    drained = spool.drain(3)
    assert len(drained) == 3
    assert len(spool) == 2

    spool.clear()
    assert len(spool) == 0


def test_edge_inspection_station_batch_processing() -> None:
    """Verifies EdgeInspectionStation filters and spools only forwarded packets."""
    forwarded_callback_records = []

    def on_forward(packet: FilteredFramePacket) -> None:
        forwarded_callback_records.append(packet.product_id)

    station = EdgeInspectionStation(
        edge_filter=EdgeNoiseFilter(pass_drop_ratio=1.0), forward_handler=on_forward
    )

    parts = [
        ConveyorPart(product_id="PRD-1", machine_id="CNC-01", tool_id="T04", status="PASS"),
        ConveyorPart(
            product_id="PRD-2",
            machine_id="CNC-02",
            tool_id="T07",
            status="DEFECT_SCRATCH",
            defect_type="scratch_vertical",
        ),
        ConveyorPart(product_id="PRD-3", machine_id="CNC-01", tool_id="T04", status="PASS"),
    ]

    forwarded = station.process_batch(parts)
    assert len(forwarded) == 1
    assert forwarded[0].product_id == "PRD-2"
    assert forwarded_callback_records == ["PRD-2"]
    assert len(station.spool) == 1


def test_pubsub_dispatcher_offline_fallback() -> None:
    """Verifies EdgePubSubDispatcher records events in memory when offline or in dry-run mode."""
    dispatcher = EdgePubSubDispatcher(dry_run=True)

    quality_evt = QualityEventPayload(
        machine_id="CNC-02",
        tool_id="T07",
        defect_type="scratch_vertical",
        scenario="cnc_tool_wear",
    )
    telemetry_evt = MachineTelemetryPayload(
        machine_id="CNC-02",
        tool_id="T07",
        spindle_vibration=2.85,
        motor_current=13.4,
        spindle_temp=44.2,
        rpm=1470,
        operating_status="WARNING",
    )
    traceability_evt = TraceabilityEventPayload(
        product_id="PRD-501",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT",
    )

    assert dispatcher.publish_quality_event(quality_evt) is True
    assert dispatcher.publish_telemetry(telemetry_evt) is True
    assert dispatcher.publish_traceability(traceability_evt) is True

    events = dispatcher.get_published_events()
    assert len(events) == 3
    topics = [e["topic"] for e in events]
    assert "kaizen-quality-events" in topics
    assert "kaizen-telemetry" in topics
    assert "kaizen-traceability" in topics

    dispatcher.clear_published_events()
    assert len(dispatcher.get_published_events()) == 0
    dispatcher.close()


def test_pubsub_dispatcher_anomaly_dispatch_bundle() -> None:
    """Verifies dispatch_anomaly broadcasts to all three topic channels."""
    dispatcher = EdgePubSubDispatcher(dry_run=True)

    packet = FilteredFramePacket(
        frame_hash="abc123hash",
        camera_id="CAM-EOL-01",
        product_id="PRD-999",
        machine_id="CNC-02",
        tool_id="T07",
        lot_id="AL-5083-B4",
        conveyor_timestamp="2026-10-15T12:00:00Z",
        classification="DEFECT",
        is_defect=True,
        defect_type="scratch_vertical",
        confidence=0.96,
        uncertainty=0.04,
        filter_decision="FORWARD",
    )
    telemetry = MachineTelemetry(
        machine_id="CNC-02",
        tool_id="T07",
        spindle_vibration=2.91,
        motor_current=13.6,
        spindle_temp=45.1,
        rpm=1460,
        operating_status="ALARM",
    )

    results = dispatcher.dispatch_anomaly(
        packet=packet,
        scenario="cnc_tool_wear",
        telemetry=telemetry,
    )

    assert results["quality_event"] is True
    assert results["traceability"] is True
    assert results["telemetry"] is True
    assert len(dispatcher.get_published_events()) == 3


def test_factory_simulator_service_with_edge_and_pubsub() -> None:
    """Verifies FactorySimulatorService step executes edge inspection and exposes edge statistics."""
    import asyncio

    service = FactorySimulatorService(speed=10.0, dry_run=True, pubsub=True, seed=42)
    service.trigger_anomaly(machine_id="CNC-02", scenario="cnc_tool_wear")

    summary = asyncio.run(service.step())

    assert summary.edge_stats is not None
    assert summary.edge_stats.total_frames_evaluated > 0
    assert summary.tick_index == 1
    # Check that pubsub dispatcher captured events from trigger and step
    published = service.pubsub_dispatcher.get_published_events()
    assert len(published) >= 1
    service.stop()


def test_simulator_has_zero_import_dependencies_on_backend() -> None:
    """Audits the AST of every python file in simulator/ to ensure 0 imports of backend modules."""
    simulator_root = Path(__file__).resolve().parent.parent / "simulator"
    assert simulator_root.is_dir()

    backend_imports = []
    for py_file in simulator_root.rglob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "backend" or alias.name.startswith("backend."):
                        backend_imports.append((str(py_file), alias.name))
            elif isinstance(node, ast.ImportFrom):
                if node.module and (node.module == "backend" or node.module.startswith("backend.")):
                    backend_imports.append((str(py_file), node.module))

    assert not backend_imports, (
        f"Decoupling violation: simulator/ modules must not import from backend/: {backend_imports}"
    )
