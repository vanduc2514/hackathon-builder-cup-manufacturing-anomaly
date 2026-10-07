"""API Route: WebSocket proxy handling real-time audio and video streaming with Gemini Live API."""

import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/live", tags=["live-api"])

@router.websocket("/stream")
async def gemini_live_stream(websocket: WebSocket):
    """
    WebSocket endpoint that would proxy audio/video to the Gemini Live API.
    In a full implementation, this connects to wss://[location]-aiplatform.googleapis.com/...
    """
    await websocket.accept()
    logger.info("Client connected to Gemini Live API proxy")
    
    try:
        if settings.ai_provider == "ollama":
            # Ollama does not support Live API, so we mock a response
            await websocket.send_json({
                "type": "server_message",
                "content": "Live API is not supported in Ollama local mode. Please switch AI_PROVIDER to gemini."
            })
            await asyncio.sleep(1)
            await websocket.close()
            return

        # Mock the Live API interaction for the prototype
        await websocket.send_json({
            "type": "server_message",
            "content": "Connected to Gemini Live API. Awaiting audio/video stream..."
        })
        
        while True:
            data = await websocket.receive_text()
            logger.info("Received data on Live API proxy: %s", data[:50])
            
            # Echo back a mock response
            await websocket.send_json({
                "type": "server_message",
                "content": "I see the issue with the cutting tool. Let me guide you through the repair..."
            })
            
    except WebSocketDisconnect:
        logger.info("Client disconnected from Gemini Live API proxy")
    except Exception as e:
        logger.error(f"Error in Live API proxy: {e}")
        try:
            await websocket.close()
        except:
            pass
