# Reactive Blackboard SSE Protocol & Event Streaming

The Blackboard streams realtime incident lifecycle events to the frontend dashboard via Server-Sent Events (SSE) at `/api/incidents/stream`.

## Event Protocol & Wire Format

Every event published to the SSE stream adheres to the `BlackboardEvent` schema:

```json
{
  "event_id": "evt-948201",
  "incident_id": "inc-20261006-001",
  "timestamp": "2026-10-06T09:30:00Z",
  "phase": "PHASE_B_RCA",
  "source_agent": "root_cause_agent",
  "data": {
    "finding": "Spindle bearing defect identified with 88% confidence",
    "citations": [
      {
        "document_id": "manual_cnc_fanuc_02.pdf",
        "page_number": 112
      }
    ]
  }
}
```

## SSE Endpoint Architecture in FastAPI

Mounted in the incidents API router:

```python
from sse_starlette.sse import EventSourceResponse

@router.get("/stream")
async def incident_stream(request: Request):
    async def event_generator():
        queue = blackboard.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                event = await queue.get()
                yield {
                    "event": "blackboard_update",
                    "data": event.model_dump_json()
                }
        finally:
            blackboard.unsubscribe(queue)

    return EventSourceResponse(event_generator())
```

## Frontend Connection (`frontend/src/`)
The React dashboard consumes the stream using `EventSource('/api/incidents/stream')` with automatic backoff reconnection.
