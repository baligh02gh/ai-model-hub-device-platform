import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing {name}. Check the .env file in the project root.")
    return value


# The test suite sets this flag before importing the application. Keep test-only
# credentials local and harmless; production still requires explicit secrets.
if os.getenv("TRINOVATECH_TESTING") == "1":
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///:memory:")
    SECRET_KEY = os.getenv("SECRET_KEY", "test-only-key-never-use-in-production")
else:
    DATABASE_URL = require("DATABASE_URL")
    SECRET_KEY = require("SECRET_KEY")
