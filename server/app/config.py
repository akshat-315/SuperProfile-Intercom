from typing import Literal

from pydantic import Field
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

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
