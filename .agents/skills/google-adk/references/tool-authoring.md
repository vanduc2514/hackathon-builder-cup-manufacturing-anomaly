# ADK Tool Authoring & Development Conventions

Stateless tool functions are invoked by ADK agents to execute deterministic queries, calculations, and retrievals.

## Core Rules for ADK Tools

1. **Stateless Functions**: Tools must be pure, stateless async or synchronous Python functions. Never maintain mutable cross-request state inside tool files.
2. **Pydantic Contracts**: All structured tool inputs and outputs must map to typed domain Pydantic models (Key Invariant 1).
3. **No Direct Agent-to-Agent Calls**: Tools interact exclusively with underlying databases, mathematical formulas, or external APIs. They never call other agents (Key Invariant 2).
4. **Resilient Local Fallback**: Tools must function in local development without GCP credentials by utilizing emulators or mock data (Key Invariant 4).

## Tool Pattern Example

```python
from __future__ import annotations
"""ADK tool function template for Kaizen Agent."""

import logging
from backend.core.models import SpcCalculationResult

logger = logging.getLogger(__name__)

async def calculate_spc_metrics(
    samples: list[float], 
    historical_mean: float, 
    historical_std: float
) -> SpcCalculationResult:
    """Calculate Upper Control Limit (UCL) and detect out-of-control conditions."""
    ucl = historical_mean + (3.0 * historical_std)
    lcl = max(0.0, historical_mean - (3.0 * historical_std))
    
    current_value = samples[-1] if samples else 0.0
    breached = current_value > ucl
    
    logger.info(f"SPC checked: val={current_value:.3f}, UCL={ucl:.3f}, breached={breached}")
    return SpcCalculationResult(
        mean=historical_mean,
        ucl=ucl,
        lcl=lcl,
        is_breached=breached,
    )
```

## Standard Tool Implementations
- `bigquery_tool`: Traceability queries & sensor telemetry correlation.
- `spc_calculator`: Statistical process control limits & Nelson rule checks.
- `impact_calculator`: Material scrap, carbon emissions, and monetary savings.
- `rag_search_tool`: SOP, machine manual, and 8D report retrieval.
