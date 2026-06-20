"""
tests/test_config.py
====================
Unit tests for the application configuration and production hardening features.
Tests secure CORS constraints, email backend requirement checks, and environment setup.
"""

from __future__ import annotations

import os
import sys
import pytest
from pydantic import ValidationError

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from filingpulse.app.config import Settings


def test_valid_development_config() -> None:
    """Ensure standard development configuration is valid."""
    config = Settings(
        environment="development",
        secret_key="a_very_secure_secret_key_at_least_32_characters_long",
        admin_api_key="secure_admin_key",
        database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse",
        cors_origins="*",
        email_backend="smtp",
    )
    assert config.environment == "development"
    assert config.cors_origins == ["*"]


def test_production_wildcard_cors_raises_error() -> None:
    """Ensure that setting CORS_ORIGINS to '*' in production environment raises a validation error."""
    # We patch ENVIRONMENT in os.environ for the class validator, or pass it directly.
    # The validator _warn_wildcard_cors reads ENVIRONMENT from os.environ.
    os.environ["ENVIRONMENT"] = "production"
    try:
        with pytest.raises(ValidationError, match="CORS_ORIGINS cannot contain '\\*'"):
            Settings(
                environment="production",
                secret_key="a_very_secure_secret_key_at_least_32_characters_long",
                admin_api_key="secure_admin_key",
                database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse",
                cors_origins="*",
            )
    finally:
        os.environ["ENVIRONMENT"] = "development"


def test_production_explicit_cors_succeeds() -> None:
    """Ensure explicit domains are allowed for CORS in production."""
    os.environ["ENVIRONMENT"] = "production"
    try:
        config = Settings(
            environment="production",
            secret_key="a_very_secure_secret_key_at_least_32_characters_long",
            admin_api_key="secure_admin_key",
            database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse",
            cors_origins="https://app.filingpulse.com,https://api.filingpulse.com",
        )
        assert config.cors_origins == ["https://app.filingpulse.com", "https://api.filingpulse.com"]
    finally:
        os.environ["ENVIRONMENT"] = "development"


def test_resend_backend_requires_api_key() -> None:
    """Ensure email_backend 'resend' requires resend_api_key to be configured."""
    # Should fail if resend_api_key is missing or empty
    with pytest.raises(ValidationError, match="resend_api_key is required when email_backend is set to 'resend'"):
        Settings(
            environment="development",
            secret_key="a_very_secure_secret_key_at_least_32_characters_long",
            admin_api_key="secure_admin_key",
            database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse",
            email_backend="resend",
            resend_api_key=None,
        )

    # Should succeed if resend_api_key is supplied
    config = Settings(
        environment="development",
        secret_key="a_very_secure_secret_key_at_least_32_characters_long",
        admin_api_key="secure_admin_key",
        database_url="postgresql+asyncpg://postgres:postgres@localhost:5432/filingpulse",
        email_backend="resend",
        resend_api_key="re_secure_api_key_12345",
    )
    assert config.email_backend == "resend"
    assert config.resend_api_key == "re_secure_api_key_12345"
