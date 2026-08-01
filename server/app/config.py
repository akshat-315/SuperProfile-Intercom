import secrets
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    version: str = "0.1.0"
    database_url: str = Field(min_length=1)

    session_secret: str = ""
    app_url: str = "http://localhost:3000"

    resend_api_key: str = ""
    email_domain: str = "aksht.dev"
    email_from: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.environment != "development"

    @model_validator(mode="after")
    def _check_session_secret(self) -> Self:
        if self.is_production and len(self.session_secret) < 32:
            raise ValueError(
                "SESSION_SECRET must be set to at least 32 characters in production. "
                "Generate one with: openssl rand -base64 48"
            )
        if not self.session_secret:
            self.session_secret = secrets.token_urlsafe(32)
        return self


settings = Settings()
