"""Unit tests for Gemma 3 edge frame classifier, noise filter, and edge pipeline."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from backend.core.models import (
    BoundingBox,
    EdgeClassificationResult,
    FilteredFramePacket,
    InspectionFrame,
)
from backend.edge.gateway.edge_filter import (
    EdgeAlertSpool,
    EdgeInspectionStation,
    EdgeNoiseFilter,
    compute_frame_hash,
)
from backend.edge.gateway.gemma_classifier import EdgeClassifierMode, GemmaEdgeClassifier
from backend.edge.simulator.run_sim import EdgeSimulatorRunner
from simulator.models import ConveyorPart


def test_bounding_box_model():
    """Validates BoundingBox creation, coordinate export, and area computation."""
    bbox = BoundingBox(ymin=0.25, xmin=0.48, ymax=0.75, xmax=0.52)
    assert bbox.ymin == 0.25
    assert bbox.to_list() == [0.25, 0.48, 0.75, 0.52]
    assert pytest.approx(bbox.area, rel=1e-3) == (0.75 - 0.25) * (0.52 - 0.48)

    with pytest.raises(Exception):
        BoundingBox(ymin=-0.1, xmin=0.0, ymax=1.0, xmax=1.0)


def test_compute_frame_hash_provenance():
    """Validates cryptographic SHA-256 hash generation and reproducibility."""
    h1 = compute_frame_hash(
        camera_id="CAM-LINE01-EOL",
        conveyor_timestamp="2026-10-08T03:00:00Z",
        product_id="PRD-1001",
        machine_id="CNC-02",
        tool_id="T07",
        image_token="mvtec_ad/metal_nut/scratch/frame_001.png",
    )
    h2 = compute_frame_hash(
        camera_id="CAM-LINE01-EOL",
        conveyor_timestamp="2026-10-08T03:00:00Z",
        product_id="PRD-1001",
        machine_id="CNC-02",
        tool_id="T07",
        image_token="mvtec_ad/metal_nut/scratch/frame_001.png",
    )
    # Different product ID should produce a different hash
    h3 = compute_frame_hash(
        camera_id="CAM-LINE01-EOL",
        conveyor_timestamp="2026-10-08T03:00:00Z",
        product_id="PRD-1002",
        machine_id="CNC-02",
        tool_id="T07",
        image_token="mvtec_ad/metal_nut/scratch/frame_001.png",
    )

    assert len(h1) == 64
    assert h1 == h2
    assert h1 != h3


def test_classifier_heuristic_pass_part():
    """Asserts that normal parts pass cleanly without actuating the diverter."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.HEURISTIC)
    frame = InspectionFrame(
        product_id="PRD-5001",
        machine_id="CNC-01",
        tool_id="T04",
        status="PASS",
    )
    res = classifier.classify_frame(frame)
    assert not res.is_defect
    assert res.defect_type is None
    assert res.confidence >= 0.95
    assert res.uncertainty <= 0.05
    assert not res.diverter_actuated
    assert res.bounding_box is None
    assert res.inference_time_ms > 0.0


def test_classifier_heuristic_defect_signatures():
    """Asserts that mechanical and mold defect signatures are correctly identified and tagged."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.HEURISTIC)

    # 1. Scratch vertical (Scenario 1 tool wear)
    f_scratch = InspectionFrame(
        product_id="PRD-5002",
        machine_id="CNC-02",
        tool_id="T07",
        defect_type="scratch_vertical",
    )
    res_scratch = classifier.classify_frame(f_scratch)
    assert res_scratch.is_defect
    assert res_scratch.defect_type == "scratch_vertical"
    assert res_scratch.diverter_actuated
    assert res_scratch.bounding_box is not None
    assert res_scratch.bounding_box.to_list() == [0.25, 0.48, 0.75, 0.52]

    # 2. Short fill (Scenario 2 injection molding)
    f_short = InspectionFrame(
        product_id="PRD-5003",
        machine_id="IM-05",
        tool_id="MOLD-03",
        cavity_id=3,
        defect_type="short_fill",
    )
    res_short = classifier.classify_frame(f_short)
    assert res_short.is_defect
    assert res_short.defect_type == "short_fill"
    assert res_short.diverter_actuated
    assert res_short.bounding_box.to_list() == [0.10, 0.10, 0.40, 0.45]

    # 3. Sink mark
    f_sink = InspectionFrame(
        product_id="PRD-5004",
        machine_id="IM-05",
        tool_id="MOLD-03",
        defect_type="sink_mark",
    )
    res_sink = classifier.classify_frame(f_sink)
    assert res_sink.is_defect
    assert res_sink.defect_type == "sink_mark"
    assert res_sink.diverter_actuated
    assert res_sink.bounding_box.to_list() == [0.40, 0.40, 0.60, 0.60]


def test_classifier_dataset_playback_mvtec():
    """Asserts dataset playback parses MVTec AD paths into defect and pass outcomes."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.DATASET_PLAYBACK)

    # Scratch frame
    f_scratch = ConveyorPart(
        product_id="PRD-6001",
        machine_id="CNC-02",
        tool_id="T07",
        image_token="mvtec_ad/metal_nut/scratch/frame_018.png",
    )
    res_scratch = classifier.classify_frame(f_scratch)
    assert res_scratch.is_defect
    assert res_scratch.defect_type == "scratch_vertical"
    assert res_scratch.diverter_actuated

    # Good frame
    f_good = ConveyorPart(
        product_id="PRD-6002",
        machine_id="CNC-01",
        tool_id="T04",
        image_token="mvtec_ad/metal_nut/good/frame_005.png",
    )
    res_good = classifier.classify_frame(f_good)
    assert not res_good.is_defect
    assert res_good.defect_type is None
    assert not res_good.diverter_actuated


def test_classifier_ollama_mock_success():
    """Asserts that live Ollama API response is parsed into structured classification."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.OLLAMA)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "response": '{"is_defect": true, "defect_type": "surface_crack", "confidence": 0.93, "bounding_box": [0.15, 0.25, 0.65, 0.75]}'
    }

    with patch("httpx.Client.post", return_value=mock_resp):
        res = classifier.classify_frame({"product_id": "PRD-7001", "machine_id": "CNC-02"})
        assert res.is_defect
        assert res.defect_type == "surface_crack"
        assert res.confidence == 0.93
        assert res.operating_mode == "ollama"
        assert res.bounding_box is not None
        assert res.bounding_box.to_list() == [0.15, 0.25, 0.65, 0.75]
        assert res.diverter_actuated


def test_classifier_ollama_error_fallback():
    """Asserts graceful heuristic fallback when Ollama is offline or raises network errors."""
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.OLLAMA)

    with patch("httpx.Client.post", side_effect=httpx.ConnectError("Connection refused")):
        res = classifier.classify_frame(
            {
                "product_id": "PRD-7002",
                "machine_id": "CNC-02",
                "status": "DEFECT_SCRATCH",
            }
        )
        # Should not raise exception; must fall back gracefully
        assert res.is_defect
        assert res.defect_type == "scratch_vertical"
        assert res.operating_mode == "heuristic_fallback"
        assert res.diverter_actuated


def test_edge_noise_filter_95_percent_drop_ratio():
    """Validates the 95% pass frame drop policy conserving cloud network bandwidth."""
    noise_filter = EdgeNoiseFilter(pass_drop_ratio=0.95, confidence_threshold=0.85)
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.HEURISTIC)

    evaluated_frames = 100
    packets: list[FilteredFramePacket] = []

    for i in range(evaluated_frames):
        part = ConveyorPart(
            product_id=f"PRD-PASS-{i:03d}",
            machine_id="CNC-01",
            tool_id="T04",
            status="PASS",
        )
        cls_result = classifier.classify_frame(part)
        packet = noise_filter.evaluate_frame(part, cls_result)
        packets.append(packet)

    stats = noise_filter.get_statistics()
    # At 95% drop ratio, exactly 95 out of 100 PASS frames should be dropped locally
    assert stats.total_frames_evaluated == 100
    assert stats.pass_frames_dropped >= 95
    assert stats.drop_ratio >= 0.95
    assert stats.cloud_bandwidth_reduction_pct >= 95.0
    assert stats.estimated_bandwidth_saved_mb > 0.0

    dropped_packets = [p for p in packets if p.filter_decision == "DROP"]
    assert len(dropped_packets) >= 95


def test_edge_noise_filter_defect_forwarding_100_percent():
    """Validates that 100% of defect frames are forwarded to cloud Quality Inspector."""
    noise_filter = EdgeNoiseFilter(pass_drop_ratio=0.95)
    classifier = GemmaEdgeClassifier(mode=EdgeClassifierMode.HEURISTIC)

    defect_count = 20
    forwarded_packets: list[FilteredFramePacket] = []

    for i in range(defect_count):
        part = ConveyorPart(
            product_id=f"PRD-DEFECT-{i:03d}",
            machine_id="CNC-02",
            tool_id="T07",
            status="DEFECT_SCRATCH",
            defect_type="scratch_vertical",
        )
        cls_result = classifier.classify_frame(part)
        packet = noise_filter.evaluate_frame(part, cls_result)
        if packet.filter_decision == "FORWARD":
            forwarded_packets.append(packet)

    stats = noise_filter.get_statistics()
    assert len(forwarded_packets) == defect_count
    assert stats.defect_frames_forwarded == defect_count
    assert stats.pass_frames_dropped == 0

    # Verify metrology tags on forwarded packet
    sample = forwarded_packets[0]
    assert sample.classification == "DEFECT"
    assert sample.is_defect
    assert sample.defect_type == "scratch_vertical"
    assert len(sample.frame_hash) == 64
    assert sample.camera_id == "CAM-LINE01-EOL"
    assert sample.diverter_actuated
    assert sample.bounding_box is not None


def test_edge_noise_filter_uncertain_frame_forwarding():
    """Validates that ambiguous or high-uncertainty frames are forwarded for cloud review."""
    noise_filter = EdgeNoiseFilter(confidence_threshold=0.85)

    uncertain_res = EdgeClassificationResult(
        is_defect=False,
        defect_type=None,
        confidence=0.72,
        uncertainty=0.28,
        bounding_box=None,
    )

    frame = InspectionFrame(
        product_id="PRD-UNCERTAIN-01",
        machine_id="CNC-03",
        tool_id="T07",
    )

    packet = noise_filter.evaluate_frame(frame, uncertain_res)
    assert packet.filter_decision == "FORWARD"
    assert packet.classification == "UNCERTAIN"
    stats = noise_filter.get_statistics()
    assert stats.uncertain_frames_forwarded == 1


def test_edge_alert_spool_buffer():
    """Validates local ring buffer spooling up to 500 items and draining."""
    spool = EdgeAlertSpool(maxsize=5)
    dummy_pkt = FilteredFramePacket(
        frame_hash="dummy-hash-1234",
        camera_id="CAM-LINE01",
        product_id="PRD-1",
        machine_id="CNC-02",
        tool_id="T07",
        lot_id="AL-5083-B4",
        conveyor_timestamp="2026-10-08T03:00:00Z",
        classification="DEFECT",
        is_defect=True,
        confidence=0.96,
        uncertainty=0.04,
        filter_decision="FORWARD",
    )

    for i in range(8):
        pkt = dummy_pkt.model_copy(update={"product_id": f"PRD-{i}"})
        spool.append(pkt)

    # Should retain maxsize (5)
    assert len(spool) == 5
    peeked = spool.peek()
    assert len(peeked) == 5
    assert peeked[0].product_id == "PRD-3"

    drained = spool.drain(count=2)
    assert len(drained) == 2
    assert drained[0].product_id == "PRD-3"
    assert len(spool) == 3

    spool.clear()
    assert len(spool) == 0


def test_edge_inspection_station_pipeline():
    """Tests the integrated inspection station pipeline with batch processing."""
    station = EdgeInspectionStation()
    parts = [
        ConveyorPart(product_id="PRD-A", machine_id="CNC-01", tool_id="T04", status="PASS"),
        ConveyorPart(
            product_id="PRD-B",
            machine_id="CNC-02",
            tool_id="T07",
            status="DEFECT_SCRATCH",
            defect_type="scratch_vertical",
        ),
        ConveyorPart(product_id="PRD-C", machine_id="CNC-03", tool_id="T07", status="PASS"),
    ]

    forwarded = station.process_batch(parts)
    assert len(forwarded) == 1
    assert forwarded[0].product_id == "PRD-B"
    assert forwarded[0].defect_type == "scratch_vertical"
    assert len(station.spool) == 1


def test_edge_simulator_runner_execution():
    """Smoke tests the edge simulator runner with synthetic conveyor feed."""
    runner = EdgeSimulatorRunner(
        mode="heuristic",
        drop_ratio=0.95,
        inject_on_start=True,
        scenario="cnc_tool_wear",
    )
    # Execute 3 steps
    for _ in range(3):
        runner.step()

    stats = runner.edge_filter.get_statistics()
    assert stats.total_frames_evaluated > 0
    assert stats.pass_frames_dropped > 0
    assert stats.cloud_bandwidth_reduction_pct > 0.0


def test_gemma_edge_classifier_on_premise_boundary():
    """Validates that GemmaEdgeClassifier adheres to the edge-only architectural boundary."""
    # Ensure allowed modes strictly represent edge/local operations
    allowed_modes = {mode.value for mode in EdgeClassifierMode}
    assert allowed_modes == {"ollama", "heuristic", "dataset_playback"}

    # Default heuristic mode requires zero cloud credentials or network services
    classifier = GemmaEdgeClassifier(mode="heuristic")
    frame = InspectionFrame(
        product_id="PRD-1099",
        machine_id="CNC-02",
        tool_id="T07",
        status="DEFECT_SCRATCH",
        defect_type="scratch_vertical",
    )
    result = classifier.classify_frame(frame)
    assert result.is_defect is True
    assert result.defect_type == "scratch_vertical"
    assert result.diverter_actuated is True
    assert result.model_name == "gemma-3-2b-edge"
    # Guaranteed sub-50ms constraint for physical scrap diverter actuation
    assert result.inference_time_ms < 50.0


def test_gemma_edge_classifier_zero_cloud_dependency(monkeypatch: pytest.MonkeyPatch):
    """Verifies edge classifier operates without GCP cloud credentials or external cloud connectivity."""
    # Clear any cloud environment variables to simulate isolated factory floor
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)

    classifier = GemmaEdgeClassifier(
        mode=EdgeClassifierMode.OLLAMA,
        ollama_url="http://127.0.0.1:9999",  # Unreachable local port
        timeout_seconds=0.1,
    )

    # Should gracefully degrade to heuristic fallback on-premise without throwing or calling cloud
    frame = InspectionFrame(
        product_id="PRD-TEST-OFFLINE",
        machine_id="CNC-01",
        tool_id="T04",
        status="PASS",
    )
    res = classifier.classify_frame(frame)
    assert res.is_defect is False
    assert res.operating_mode == "heuristic_fallback"
    assert res.diverter_actuated is False
