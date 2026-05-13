from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.garmin_auth import GarminAuthService
from app.garmin_client import GarminClient
from app.models import (
    GarminAuthStartResponse,
    GarminStatusResponse,
    GarminWorkoutPreviewRequest,
    GarminWorkoutPreviewResponse,
    GarminWorkoutPublishRequest,
    GarminWorkoutPublishResponse,
    HealthResponse,
)
from app.security import (
    ALLOWED_CORS_ORIGINS,
    GARMIN_BRIDGE_HEADER,
    is_public_request,
    load_bridge_security_config,
    unauthorized_bridge_response,
    validate_bridge_key,
)
from app.workout_mapper import GarminWorkoutMappingError, build_garmin_preview

APP_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.security_config = load_bridge_security_config()
    yield


app = FastAPI(
    title="Run Coach Local Garmin Bridge",
    version=APP_VERSION,
    description="Local-only experimental bridge for Garmin workout export.",
    lifespan=lifespan,
)


@app.middleware("http")
async def require_bridge_api_key(request: Request, call_next):
    if is_public_request(request) or validate_bridge_key(request):
        return await call_next(request)

    return unauthorized_bridge_response(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[GARMIN_BRIDGE_HEADER, "Content-Type"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="local-garmin-bridge",
        version=APP_VERSION,
        local_only=True,
    )


@app.get("/garmin/status", response_model=GarminStatusResponse)
def garmin_status() -> GarminStatusResponse:
    return GarminAuthService().get_status()


@app.post("/garmin/auth/start", response_model=GarminAuthStartResponse)
def garmin_auth_start() -> GarminAuthStartResponse:
    return GarminAuthService().start_auth()


@app.post(
    "/garmin/workouts/preview",
    response_model=GarminWorkoutPreviewResponse,
)
def preview_workout(
    request: GarminWorkoutPreviewRequest,
) -> GarminWorkoutPreviewResponse:
    try:
        preview, garmin_payload, warnings = build_garmin_preview(request.workout)
    except GarminWorkoutMappingError as error:
        return GarminWorkoutPreviewResponse(
            ok=False,
            message=str(error),
            preview=None,
            garmin_payload=None,
            warnings=[str(error)],
        )

    return GarminWorkoutPreviewResponse(
        ok=True,
        message="Garmin workout preview generated. No Garmin API call was made.",
        preview=preview,
        garmin_payload=garmin_payload,
        warnings=warnings,
    )


@app.post(
    "/garmin/workouts/publish",
    response_model=GarminWorkoutPublishResponse,
)
def publish_workout(
    request: GarminWorkoutPublishRequest,
) -> GarminWorkoutPublishResponse:
    try:
        preview, garmin_payload, warnings = build_garmin_preview(
            request.workout,
            schedule_date=request.schedule_date,
        )
    except GarminWorkoutMappingError as error:
        return GarminWorkoutPublishResponse(
            ok=False,
            status="invalid_workout",
            message=str(error),
            garmin_workout_id=None,
            schedule_result=None,
            preview=None,
            garmin_payload=None,
            warnings=[str(error)],
        )

    response = GarminClient().publish_workout(preview, garmin_payload)

    return GarminWorkoutPublishResponse(
        ok=response.ok,
        status=response.status,
        message=response.message,
        garmin_workout_id=response.garmin_workout_id,
        schedule_result=response.schedule_result,
        preview=response.preview,
        garmin_payload=response.garmin_payload,
        warnings=[*warnings, *response.warnings],
    )
