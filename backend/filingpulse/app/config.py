"""
app/config.py
=============
Application configuration loaded from environment variables via Pydantic
BaseSettings.  All secrets (DB URL, SMTP password, API keys, etc.) live in .env
and are never hard-coded.  See .env.example for the full list of required and
optional variables.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # App
    # ------------------------------------------------------------------
    app_name: str = "FilingPulse"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    secret_key: str = Field(..., min_length=32)
    cors_origins: str | list[str] = Field(
        default=["*"],
        description="Comma-separated allowed origins for CORS. Automatically parsed into a list."
    )

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------
    admin_api_key: str = Field(
        ...,
        description="Bearer token required for admin-only endpoints (POST /jurisdictions).",
    )

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    database_url: PostgresDsn = Field(
        ...,
        description=(
            "Async PostgreSQL DSN.  Must use the asyncpg driver: "
            "postgresql+asyncpg://user:pass@host/dbname"
        ),
    )

    # SQLAlchemy async pool settings
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # ------------------------------------------------------------------
    # Third-party API keys
    # ------------------------------------------------------------------
    # Global default Socrata app token (per-jurisdiction tokens in jurisdiction
    # config take precedence; this is a convenient fallback for all adapters).
    socrata_app_token: str | None = Field(
        default=None,
        description="Socrata SODA app token — get one at https://data.socrata.com",
    )

    # NOAA Climate Data Online API token (https://www.ncdc.noaa.gov/cdo-web/token)
    noaa_token: str | None = Field(
        default=None,
        description="NOAA Climate Data Online personal access token.",
    )

    # ------------------------------------------------------------------
    # Geocoder (US Census Bureau — no key required)
    # ------------------------------------------------------------------
    census_geocoder_url: str = (
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    )
    census_geocoder_benchmark: str = "Public_AR_Current"
    census_geocoder_timeout: int = 10  # seconds
    census_geocoder_retries: int = 3

    # ------------------------------------------------------------------
    # Email — SMTP (default) or Resend
    # ------------------------------------------------------------------
    email_backend: Literal["smtp", "resend"] = "smtp"

    # SMTP settings (used when email_backend == "smtp")
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_from_address: str = "noreply@filingpulse.local"
    smtp_from_name: str = "FilingPulse Alerts"

    # Resend settings (used when email_backend == "resend")
    resend_api_key: str | None = None
    resend_from_address: str = "noreply@filingpulse.local"
    resend_api_url: str = "https://api.resend.com/emails"

    # ------------------------------------------------------------------
    # Rate limiting (slowapi / Redis-backed in production)
    # ------------------------------------------------------------------
    # GET /filings is rate-limited; adjust for your traffic
    filings_rate_limit: str = "60/minute"

    # ------------------------------------------------------------------
    # Scheduler
    # ------------------------------------------------------------------
    scheduler_timezone: str = "UTC"
    # Default poll interval if not overridden per-jurisdiction (seconds)
    default_poll_interval_seconds: int = 86_400

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("database_url", mode="before")
    @classmethod
    def _require_asyncpg(cls, v: str) -> str:
        if "asyncpg" not in str(v):
            raise ValueError(
                "DATABASE_URL must use the asyncpg driver: "
                "postgresql+asyncpg://..."
            )
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_origins(cls, v: any) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for p in v.split(",") for o in [p.strip()] if o]
        return v

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _warn_wildcard_cors(cls, v: list[str]) -> list[str]:
        """Disallow wildcard CORS origin in production, raise ValueError."""
        import os as _os
        env = _os.environ.get("ENVIRONMENT", "development")
        if "*" in v and env == "production":
            raise ValueError(
                "SECURITY ERROR: CORS_ORIGINS cannot contain '*' (wildcard) in a production environment. "
                "Set CORS_ORIGINS to your actual, explicit frontend domain(s) in the production .env file."
            )
        return v

    @model_validator(mode="after")
    def _validate_resend_api_key(self) -> Settings:
        """Ensure that resend_api_key is provided if email_backend is set to 'resend'."""
        if self.email_backend == "resend" and not self.resend_api_key:
            raise ValueError(
                "resend_api_key is required when email_backend is set to 'resend'."
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton Settings instance."""
    return Settings()  # type: ignore[call-arg]
