from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://novamart:novamart_dev_password@localhost:5432/novamart"
    backend_url: str = "http://localhost:4000"
    llm_provider: str = "auto"  # auto | groq | gemini ; auto prefers Groq when GROK_API_KEY is set
    grok_api_key: str | None = None  # a Groq key (gsk_...) despite the env var name
    groq_model: str = "openai/gpt-oss-120b"
    groq_fallback_model: str | None = "openai/gpt-oss-20b"  # used when the primary model hits its daily token cap
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    port: int = 8000
    internal_token: str = "dev-internal-token"


settings = Settings()
