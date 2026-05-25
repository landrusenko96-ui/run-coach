from contextlib import asynccontextmanager
from importlib import metadata

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.garmin_auth import GarminAuthService
from app.garmin_client import GarminClient
from app.models import (
    DebugSummary,
    GarminAuthStartResponse,
    GarminStatusResponse,
    GarminWorkoutDeleteRequest,
    GarminWorkoutDeleteResponse,
    GarminWorkoutPreviewResponse,
    GarminWorkoutPublishRequest,
    GarminWorkoutPublishResponse,
    HealthResponse,
    TargetSummary,
)
from app.security import (
    ALLOWED_CORS_ORIGINS,
    GARMIN_BRIDGE_HEADER,
    disabled_hosted_route_response,
    is_disabled_hosted_route,
    is_production_environment,
    is_public_request,
    load_bridge_security_config,
    unauthorized_bridge_response,
    validate_bridge_key,
)
from app.workout_mapper import (
    GarminWorkoutMappingError,
    build_garmin_preview,
)

APP_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.security_config = load_bridge_security_config()
    yield


app = FastAPI(
    title="Run Coach Garmin Bridge",
    version=APP_VERSION,
    description="Private bridge for Garmin workout export.",
    lifespan=lifespan,
)


@app.middleware("http")
async def require_bridge_api_key(request: Request, call_next):
    if is_disabled_hosted_route(request):
        return disabled_hosted_route_response()

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
        local_only=not is_production_environment(),
    )


@app.get("/garmin/status", response_model=GarminStatusResponse)
def garmin_status() -> GarminStatusResponse:
    return GarminAuthService().get_status()


@app.post("/garmin/auth/start", response_model=GarminAuthStartResponse)
def garmin_auth_start() -> GarminAuthStartResponse:
    if is_production_environment():
        return GarminAuthStartResponse(
            ok=False,
            auth_state="not_authenticated",
            message="Garmin auth start is disabled in hosted production.",
            next_step=(
                "Authenticate only from an SSH session on the bridge host, "
                "or temporarily run a local bridge for authentication."
            ),
        )

    return GarminAuthService().start_auth()


@app.post(
    "/garmin/workouts/preview",
    response_model=GarminWorkoutPreviewResponse,
)
def preview_workout(
    request: GarminWorkoutPublishRequest,
) -> GarminWorkoutPreviewResponse:
    try:
        result = build_garmin_preview(request)
    except GarminWorkoutMappingError as error:
        return invalid_preview_response(error)

    return GarminWorkoutPreviewResponse(
        ok=True,
        target_summary=result.target_summary,
        step_count=result.step_count,
        repeat_count=result.repeat_count,
        pace_target_count=result.pace_target_count,
        hr_target_count=result.hr_target_count,
        warnings=result.warnings,
        error=None,
        garmin_payload_preview=result.garmin_payload,
    )


def invalid_preview_response(
    error: GarminWorkoutMappingError,
) -> GarminWorkoutPreviewResponse:
    stats = getattr(error, "stats", None)
    target_summary = getattr(stats, "first_pace_target", None) or TargetSummary()

    return GarminWorkoutPreviewResponse(
        ok=False,
        target_summary=target_summary,
        step_count=getattr(stats, "step_count", 0),
        repeat_count=getattr(stats, "repeat_count", 0),
        pace_target_count=getattr(stats, "pace_target_count", 0),
        hr_target_count=getattr(stats, "hr_target_count", 0),
        warnings=[str(error)],
        error=str(error),
        garmin_payload_preview=None,
    )


def build_dry_run_response(
    request: GarminWorkoutPublishRequest,
) -> GarminWorkoutPublishResponse:
    try:
        result = build_garmin_preview(request)
    except GarminWorkoutMappingError as error:
        return invalid_workout_response(request, str(error))

    return GarminWorkoutPublishResponse(
        ok=True,
        status="DRY_RUN",
        planned_workout_id=request.planned_workout_id,
        scheduled_date=result.preview.scheduled_date,
        warnings=[*result.warnings, "Dry run only: no Garmin API call was made."],
        error=None,
        target_summary=result.target_summary,
        debug_summary=build_debug_summary(
            request=request,
            generated_step_count=result.step_count,
        ),
    )


def invalid_workout_response(
    request: GarminWorkoutPublishRequest,
    error: str,
) -> GarminWorkoutPublishResponse:
    return GarminWorkoutPublishResponse(
        ok=False,
        status="INVALID_WORKOUT",
        planned_workout_id=request.planned_workout_id,
        scheduled_date=request.workout_date.isoformat(),
        warnings=[error],
        error=error,
        target_summary=TargetSummary(),
        debug_summary=build_debug_summary(request=request, generated_step_count=0),
    )


def build_debug_summary(
    *,
    request: GarminWorkoutPublishRequest,
    generated_step_count: int,
) -> DebugSummary:
    return DebugSummary(
        dry_run=request.dry_run,
        client_version=garminconnect_version(),
        generated_step_count=generated_step_count,
    )


def garminconnect_version() -> str | None:
    try:
        return metadata.version("garminconnect")
    except metadata.PackageNotFoundError:
        return None


@app.post(
    "/garmin/workouts/publish",
    response_model=GarminWorkoutPublishResponse,
)
def publish_workout(
    request: GarminWorkoutPublishRequest,
) -> GarminWorkoutPublishResponse:
    if request.dry_run:
        return build_dry_run_response(request)

    try:
        result = build_garmin_preview(request)
    except GarminWorkoutMappingError as error:
        return invalid_workout_response(request, str(error))

    response = GarminClient().publish_workout(
        request=request,
        preview=result.preview,
        garmin_payload=result.garmin_payload,
        warnings=result.warnings,
        target_summary=result.target_summary,
        debug_summary=build_debug_summary(
            request=request,
            generated_step_count=result.step_count,
        ),
    )

    return response


@app.post(
    "/garmin/workouts/delete",
    response_model=GarminWorkoutDeleteResponse,
)
def delete_workout(
    request: GarminWorkoutDeleteRequest,
) -> GarminWorkoutDeleteResponse:
    return GarminClient().delete_workout(request)
