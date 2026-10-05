"""Core Config: Application configuration and settings."""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Kaizen Agent Platform"
    version: str = "0.1.0"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "kaizen-agent-demo")
    gcp_region: str = os.getenv("GCP_REGION", "asia-southeast1")

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
