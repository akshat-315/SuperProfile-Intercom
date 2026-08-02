import secrets
from typing import Literal, Self
from urllib.parse import urlsplit

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

    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = ""
    azure_openai_api_version: str = "2024-10-21"

    resend_api_key: str = ""
    resend_webhook_secret: str = ""
    email_domain: str = "aksht.dev"
    email_from: str = ""
    inbound_domain: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def app_origin(self) -> str:
        parsed = urlsplit(self.app_url)
        return f"{parsed.scheme}://{parsed.netloc}".lower()

    @property
    def cookie_secure(self) -> bool:
        return self.environment != "development"

    @property
    def mail_configured(self) -> bool:
        return bool(self.resend_api_key)

    @property
    def sender(self) -> str:
        return self.email_from or f"Intercom <noreply@{self.email_domain}>"

    @property
    def expose_dev_links(self) -> bool:
        return not self.is_production

    @property
    def summaries_configured(self) -> bool:
        return bool(
            self.azure_openai_endpoint
            and self.azure_openai_api_key
            and self.azure_openai_deployment
        )

    @property
    def azure_host(self) -> str:
        parsed = urlsplit(self.azure_openai_endpoint)
        return f"{parsed.scheme}://{parsed.netloc}" if parsed.netloc else ""

    @property
    def azure_chat_url(self) -> str:
        return (
            f"{self.azure_host}/openai/deployments/{self.azure_openai_deployment}"
            f"/chat/completions?api-version={self.azure_openai_api_version}"
        )

    @property
    def inbound_configured(self) -> bool:
        return bool(self.resend_webhook_secret and self.inbound_domain)

    def inbound_address(self, token: str) -> str:
        return f"{token}@{self.inbound_domain}"

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
