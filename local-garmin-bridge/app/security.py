import hmac
import os
from dataclasses import dataclass

from fastapi import Request, status
from starlette.responses import JSONResponse, Response

GARMIN_BRIDGE_API_KEY_ENV = "GARMIN_BRIDGE_API_KEY"
GARMIN_BRIDGE_HEADER = "X-Garmin-Bridge-Key"
ALLOWED_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


@dataclass(frozen=True)
class BridgeSecurityConfig:
    api_key: str


def load_bridge_security_config() -> BridgeSecurityConfig:
    api_key = os.getenv(GARMIN_BRIDGE_API_KEY_ENV, "").strip()
    if not api_key:
        raise RuntimeError(
            f"{GARMIN_BRIDGE_API_KEY_ENV} must be set before starting the local Garmin bridge."
        )

    return BridgeSecurityConfig(api_key=api_key)


def is_public_request(request: Request) -> bool:
    if request.method == "OPTIONS":
        return True

    return request.method == "GET" and request.url.path == "/health"


def validate_bridge_key(request: Request) -> bool:
    config = getattr(request.app.state, "security_config", None)
    if not isinstance(config, BridgeSecurityConfig):
        return False

    submitted_key = request.headers.get(GARMIN_BRIDGE_HEADER)
    if not submitted_key:
        return False

    return hmac.compare_digest(submitted_key, config.api_key)


def unauthorized_bridge_response(request: Request) -> Response:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": "Missing or invalid Garmin bridge API key."},
    )

    origin = request.headers.get("origin")
    if origin in ALLOWED_CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"

    return response
