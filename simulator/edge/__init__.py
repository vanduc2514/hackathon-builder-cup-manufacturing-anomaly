"""Edge gateway package: On-prem Gemma vision classifier, noise filtering, and Pub/Sub dispatch."""

from __future__ import annotations

from simulator.edge.edge_filter import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_PASS_DROP_RATIO,
    EdgeAlertSpool,
    EdgeInspectionStation,
    EdgeNoiseFilter,
    compute_frame_hash,
)
from simulator.edge.gemma_classifier import (
    EdgeClassifierMode,
    GemmaEdgeClassifier,
)
from simulator.edge.pubsub_dispatcher import (
    EdgePubSubDispatcher,
)

__all__ = [
    "DEFAULT_CONFIDENCE_THRESHOLD",
    "DEFAULT_PASS_DROP_RATIO",
    "EdgeAlertSpool",
    "EdgeClassifierMode",
    "EdgeInspectionStation",
    "EdgeNoiseFilter",
    "EdgePubSubDispatcher",
    "GemmaEdgeClassifier",
    "compute_frame_hash",
]
