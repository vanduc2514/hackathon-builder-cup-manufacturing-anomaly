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

    # AI Provider Config
    ai_provider: str = os.getenv("AI_PROVIDER", "gemini")  # Options: "gemini", "ollama", "mock"
    ollama_host: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    
    # Model Mappings (Logical name -> Actual model string)
    model_map_gemini: dict = {
        "fast_reasoning": "gemini-1.5-flash",
        "complex_reasoning": "gemini-1.5-pro",
        "vision": "gemini-1.5-pro",
        "live": "gemini-2.0-flash-exp",
        "video": "gemini-1.5-pro-video"
    }
    model_map_ollama: dict = {
        "fast_reasoning": "gemma:2b",
        "complex_reasoning": "llama3:8b",
        "vision": "llava:7b",
        "live": "not-supported",
        "video": "not-supported"
    }

    class Config:
        env_file = ".env"
        extra = "allow"



settings = Settings()
