"""Core Config: Application configuration and settings."""

from __future__ import annotations

import os
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "kaizen-local")
    gcp_region: str = os.getenv("GCP_REGION", "asia-southeast1")

    # BigQuery / Emulator settings
    bigquery_emulator_host: Optional[str] = os.getenv("BIGQUERY_EMULATOR_HOST", None)
    bigquery_dataset: str = os.getenv("BIGQUERY_DATASET", "manufacturing")

    # Gemini Live settings
    gemini_live_model: str = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash-exp")
    gemini_live_endpoint: Optional[str] = os.getenv("GEMINI_LIVE_ENDPOINT", None)
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    gemini_live_voice: str = os.getenv("GEMINI_LIVE_VOICE", "Aoede")
    gemini_live_language: str = os.getenv("GEMINI_LIVE_LANGUAGE", "vi-VN")
    gemini_live_simulation_mode: bool = os.getenv(
        "GEMINI_LIVE_SIMULATION_MODE", "true"
    ).lower() in ("true", "1", "yes")

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
