from __future__ import annotations

from datetime import date
import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    last_auth_check_at: str
    message: str


class GarminAuthStartResponse(BaseModel):
    ok: bool
    auth_state: Literal["not_authenticated", "authenticated", "auth_failed"]
    message: str
    next_step: str


class WorkoutStepRepeat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    count: int = Field(ge=1)
    steps: List["WorkoutStep"]


class WorkoutStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    type: Literal["warmup", "work", "recovery", "cooldown", "rest"]
    name: str = Field(min_length=1)
    durationType: Literal["time", "distance", "open"]
    durationValue: Optional[float] = None
    durationUnit: Optional[Literal["seconds", "meters"]] = None
    targetType: Optional[Literal["pace", "heart_rate", "rpe", "none"]] = None
    targetMin: Optional[float] = None
    targetMax: Optional[float] = None
    targetUnit: Optional[Literal["sec_per_km", "bpm", "zone", "rpe"]] = None
    notes: Optional[str] = None
    repeat: Optional[WorkoutStepRepeat] = None


class StructuredWorkout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    sport: Literal["Run"]
    name: str = Field(min_length=1)
    description: Optional[str] = None
    steps: List[WorkoutStep]
    exportSafe: Optional[bool] = None
    exportWarnings: List[str] = Field(default_factory=list)


class GarminWorkoutPublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    planned_workout_id: str = Field(
        min_length=1,
        description="Run Coach planned_workouts.id value.",
    )
    workout_name: str = Field(min_length=1)
    workout_date: date = Field(
        description="Date-only string in YYYY-MM-DD format.",
    )
    sport: Literal["Run"]
    structured_workout: StructuredWorkout
    source_app_version: Optional[str] = None
    dry_run: bool = False

    @field_validator("workout_date", mode="before")
    @classmethod
    def validate_workout_date(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("workout_date must be a YYYY-MM-DD date string.")

        return value


class GarminWorkoutDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    planned_workout_id: str = Field(
        min_length=1,
        description="Run Coach planned_workouts.id value.",
    )
    garmin_workout_id: str = Field(min_length=1)
    schedule_date: Optional[date] = Field(
        default=None,
        description="Date-only string in YYYY-MM-DD format. Required by the bridge before deleting.",
    )

    @field_validator("schedule_date", mode="before")
    @classmethod
    def validate_schedule_date(cls, value):
        if value is None:
            return value

        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("schedule_date must be a YYYY-MM-DD date string.")

        return value


class GarminPreviewStep(BaseModel):
    order: int
    step_type: str
    name: str
    duration: str
    target: str
    repeat_depth: int = 0


class GarminWorkoutPreview(BaseModel):
    planned_workout_id: str
    name: str
    sport: str
    scheduled_date: str
    steps: List[GarminPreviewStep]


class TargetSummary(BaseModel):
    target_type: str = "unknown"
    target_min: Optional[float] = None
    target_max: Optional[float] = None
    target_unit: Optional[str] = None
    display: str = "No supported target mapped."


class DebugSummary(BaseModel):
    dry_run: bool
    client_library: Literal["python-garminconnect"] = "python-garminconnect"
    client_version: Optional[str] = None
    generated_step_count: int = 0


class ScheduleSummary(BaseModel):
    scheduled_date: Optional[str] = None
    garmin_schedule_id: Optional[str] = None
    result_type: Literal[
        "SCHEDULED",
        "SCHEDULE_ID_UNAVAILABLE",
        "NOT_SCHEDULED",
    ]
    message: str


class GarminWorkoutPublishResponse(BaseModel):
    ok: bool
    status: Literal[
        "PUBLISHED",
        "DRY_RUN",
        "INVALID_WORKOUT",
        "AUTH_REQUIRED",
        "GARMIN_REJECTED",
        "UPLOADED_NOT_SCHEDULED",
    ]
    planned_workout_id: str
    garmin_workout_id: Optional[str] = None
    garmin_schedule_id: Optional[str] = None
    scheduled_date: Optional[str] = None
    schedule_summary: Optional[ScheduleSummary] = None
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    target_summary: TargetSummary = Field(default_factory=TargetSummary)
    debug_summary: Optional[DebugSummary] = None


class GarminWorkoutDeleteResponse(BaseModel):
    ok: bool
    status: Literal[
        "DELETED",
        "UNSCHEDULED_ONLY",
        "SCHEDULE_DATE_REQUIRED",
        "PAST_WORKOUT_BLOCKED",
        "AUTH_REQUIRED",
        "NOT_SUPPORTED",
        "GARMIN_REJECTED",
        "SCHEDULE_NOT_FOUND",
    ]
    planned_workout_id: str
    garmin_workout_id: str
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class GarminWorkoutPreviewResponse(BaseModel):
    ok: bool
    target_summary: TargetSummary = Field(default_factory=TargetSummary)
    step_count: int = 0
    repeat_count: int = 0
    pace_target_count: int = 0
    hr_target_count: int = 0
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    garmin_payload_preview: Optional[Dict[str, Any]] = None


WorkoutStepRepeat.model_rebuild()
