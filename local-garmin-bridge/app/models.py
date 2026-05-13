from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    local_only: bool


class GarminStatusResponse(BaseModel):
    ok: bool
    authenticated: bool
    category: Literal[
        "AUTHENTICATED",
        "NOT_AUTHENTICATED",
        "TOKEN_FILE_MISSING",
        "TOKEN_EXPIRED_OR_INVALID",
        "GARMIN_UNREACHABLE",
        "UNKNOWN_ERROR",
    ]
    client_library: Literal["python-garminconnect"]
    client_version: Optional[str] = None
    token_file_exists: bool
    token_file_path: str
    last_auth_check_at: str
    message: str


class GarminAuthStartResponse(BaseModel):
    ok: bool
    auth_state: Literal["not_authenticated", "authenticated", "auth_failed"]
    message: str
    next_step: str


class PlannedWorkoutPayload(BaseModel):
    planned_workout_id: str = Field(
        description="Run Coach planned_workouts.id value.",
    )
    title: str
    workout_date: str = Field(
        description="Date-only string in YYYY-MM-DD format.",
    )
    workout_type: str
    sport: str = "Run"
    structured_workout: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GarminWorkoutPreviewRequest(BaseModel):
    workout: PlannedWorkoutPayload


class GarminPreviewStep(BaseModel):
    order: int
    step_type: str
    name: str
    duration: str
    target: str
    repeat_depth: int = 0


class GarminWorkoutPreview(BaseModel):
    source_planned_workout_id: str
    name: str
    sport: str
    scheduled_date: str
    workout_type: str
    steps: List[GarminPreviewStep]


class GarminWorkoutPreviewResponse(BaseModel):
    ok: bool
    message: str
    preview: Optional[GarminWorkoutPreview] = None
    garmin_payload: Optional[Dict[str, Any]] = None
    warnings: List[str] = Field(default_factory=list)


class GarminWorkoutPublishRequest(BaseModel):
    workout: PlannedWorkoutPayload
    schedule_date: Optional[str] = Field(
        default=None,
        description="Optional override for Garmin calendar date.",
    )


class GarminWorkoutPublishResponse(BaseModel):
    ok: bool
    status: Literal[
        "published",
        "not_published",
        "not_authenticated",
        "invalid_workout",
        "upload_failed",
        "schedule_failed",
    ]
    message: str
    garmin_workout_id: Optional[str]
    schedule_result: Optional[Dict[str, Any]] = None
    preview: Optional[GarminWorkoutPreview] = None
    garmin_payload: Optional[Dict[str, Any]] = None
    warnings: List[str] = Field(default_factory=list)
