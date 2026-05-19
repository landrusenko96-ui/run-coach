from datetime import date
from typing import Any, Dict, Optional

from app.garmin_auth import GarminAuthService
from app.models import (
    DebugSummary,
    GarminWorkoutDeleteRequest,
    GarminWorkoutDeleteResponse,
    GarminWorkoutPreview,
    GarminWorkoutPublishRequest,
    GarminWorkoutPublishResponse,
    ScheduleSummary,
    TargetSummary,
)


class GarminClient:
    """Local-only Garmin client for the experimental direct export path."""

    def __init__(self, auth_service: Optional[GarminAuthService] = None) -> None:
        self.auth_service = auth_service or GarminAuthService()

    def publish_workout(
        self,
        request: GarminWorkoutPublishRequest,
        preview: GarminWorkoutPreview,
        garmin_payload: Dict[str, Any],
        warnings: list[str],
        target_summary: TargetSummary,
        debug_summary: DebugSummary,
    ) -> GarminWorkoutPublishResponse:
        try:
            client = self.auth_service.resume_client()
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="AUTH_REQUIRED",
                planned_workout_id=request.planned_workout_id,
                scheduled_date=preview.scheduled_date,
                warnings=[
                    *warnings,
                    "Authenticate locally before publishing to Garmin. Avoid repeated retries.",
                ],
                error=(
                    "A local Garmin session could not be resumed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                target_summary=target_summary,
                debug_summary=debug_summary,
            )

        try:
            running_workout = self._build_running_workout(garmin_payload)
            upload_result = client.upload_running_workout(running_workout)
            garmin_workout_id = self._extract_workout_id(upload_result)
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="GARMIN_REJECTED",
                planned_workout_id=request.planned_workout_id,
                scheduled_date=preview.scheduled_date,
                warnings=[*warnings, "No schedule request was made because upload did not complete."],
                error=(
                    "Garmin workout upload failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                target_summary=target_summary,
                debug_summary=debug_summary,
            )

        if garmin_workout_id is None:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="GARMIN_REJECTED",
                planned_workout_id=request.planned_workout_id,
                scheduled_date=preview.scheduled_date,
                warnings=[
                    *warnings,
                    "No schedule request was made because workoutId was unavailable.",
                ],
                error="Garmin accepted an upload response, but no workoutId was available.",
                target_summary=target_summary,
                debug_summary=debug_summary,
            )

        try:
            schedule_result = client.schedule_workout(
                garmin_workout_id,
                preview.scheduled_date,
            )
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="UPLOADED_NOT_SCHEDULED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=str(garmin_workout_id),
                scheduled_date=preview.scheduled_date,
                schedule_summary=ScheduleSummary(
                    scheduled_date=preview.scheduled_date,
                    garmin_schedule_id=None,
                    result_type="NOT_SCHEDULED",
                    message=(
                        "Garmin workout upload succeeded, but calendar scheduling did not complete."
                    ),
                ),
                warnings=[
                    *warnings,
                    "Workout may exist in Garmin Connect workout library and may need manual cleanup.",
                ],
                error=(
                    "Garmin workout uploaded, but scheduling failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                target_summary=target_summary,
                debug_summary=debug_summary,
            )

        garmin_schedule_id = self._extract_schedule_id(schedule_result)
        response_warnings = [
            *warnings,
            "Manual verification required: confirm Garmin Connect and the watch show a pace target, not No Target.",
            "Duplicate prevention is not implemented; repeated publish calls can create duplicate Garmin workouts.",
        ]
        if garmin_schedule_id is None:
            response_warnings.append("Garmin schedule response did not include a schedule ID.")

        return GarminWorkoutPublishResponse(
            ok=True,
            status="PUBLISHED",
            planned_workout_id=request.planned_workout_id,
            garmin_workout_id=str(garmin_workout_id),
            garmin_schedule_id=garmin_schedule_id,
            scheduled_date=preview.scheduled_date,
            schedule_summary=ScheduleSummary(
                scheduled_date=preview.scheduled_date,
                garmin_schedule_id=garmin_schedule_id,
                result_type=(
                    "SCHEDULED"
                    if garmin_schedule_id is not None
                    else "SCHEDULE_ID_UNAVAILABLE"
                ),
                message=(
                    "Garmin schedule request succeeded."
                    if garmin_schedule_id is not None
                    else "Garmin schedule request succeeded, but no schedule ID was returned."
                ),
            ),
            warnings=response_warnings,
            error=None,
            target_summary=target_summary,
            debug_summary=debug_summary,
        )

    def delete_workout(
        self,
        request: GarminWorkoutDeleteRequest,
        today: Optional[date] = None,
    ) -> GarminWorkoutDeleteResponse:
        if request.schedule_date is None:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="SCHEDULE_DATE_REQUIRED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "schedule_date is required before deleting Garmin workouts.",
                    "No Garmin request was made.",
                ],
                error="schedule_date is required so the bridge can block past-workout deletion.",
            )

        current_date = today or date.today()
        if request.schedule_date < current_date:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="PAST_WORKOUT_BLOCKED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "Past Garmin workout deletion is blocked by default.",
                    "No Garmin request was made.",
                ],
                error="The bridge will not delete past Garmin workouts by default.",
            )

        try:
            client = self.auth_service.resume_client()
        except Exception as error:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="AUTH_REQUIRED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "Authenticate locally before deleting Garmin workouts. Avoid repeated retries.",
                ],
                error=(
                    "A local Garmin session could not be resumed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
            )

        delete_method = getattr(client, "delete_workout", None)
        if callable(delete_method):
            try:
                delete_method(request.garmin_workout_id)
            except Exception as error:
                return GarminWorkoutDeleteResponse(
                    ok=False,
                    status="GARMIN_REJECTED",
                    planned_workout_id=request.planned_workout_id,
                    garmin_workout_id=request.garmin_workout_id,
                    warnings=[
                        "Garmin did not confirm workout deletion.",
                    ],
                    error=(
                        "Garmin workout deletion failed. "
                        f"Safe error category: {self.auth_service.safe_error_category(error)}."
                    ),
                )

            return GarminWorkoutDeleteResponse(
                ok=True,
                status="DELETED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "Garmin delete request completed.",
                    "The bridge cannot verify completed-workout status; callers must avoid deleting completed workouts.",
                    "Manual verification recommended: confirm the workout is gone from Garmin Connect and the watch.",
                ],
                error=None,
            )

        unschedule_method = getattr(client, "unschedule_workout", None)
        schedule_lookup_method = getattr(client, "get_scheduled_workouts", None)
        if not callable(unschedule_method) or not callable(schedule_lookup_method):
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="NOT_SUPPORTED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "The installed Garmin client does not expose a supported workout delete or safe unschedule path.",
                    "No Garmin delete request was made.",
                ],
                error="Garmin workout deletion is not supported by the available client.",
            )

        try:
            scheduled_workouts = schedule_lookup_method(
                request.schedule_date.year,
                request.schedule_date.month,
            )
            scheduled_workout_id = self._find_scheduled_workout_id(
                scheduled_workouts,
                request.garmin_workout_id,
            )
        except Exception as error:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="GARMIN_REJECTED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "Garmin schedule lookup failed, so no unschedule request was made.",
                ],
                error=(
                    "Garmin scheduled workout lookup failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
            )

        if scheduled_workout_id is None:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="SCHEDULE_NOT_FOUND",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "No matching scheduled Garmin workout was found for that date.",
                    "No Garmin unschedule request was made.",
                ],
                error="Could not find a scheduled Garmin workout matching garmin_workout_id.",
            )

        try:
            unschedule_method(scheduled_workout_id)
        except Exception as error:
            return GarminWorkoutDeleteResponse(
                ok=False,
                status="GARMIN_REJECTED",
                planned_workout_id=request.planned_workout_id,
                garmin_workout_id=request.garmin_workout_id,
                warnings=[
                    "Garmin did not confirm workout unscheduling.",
                ],
                error=(
                    "Garmin workout unschedule failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
            )

        return GarminWorkoutDeleteResponse(
            ok=True,
            status="UNSCHEDULED_ONLY",
            planned_workout_id=request.planned_workout_id,
            garmin_workout_id=request.garmin_workout_id,
            warnings=[
                "Garmin unschedule request completed.",
                "The workout may still exist in the Garmin workout library.",
                "The bridge cannot verify completed-workout status; callers must avoid deleting completed workouts.",
                "Manual verification recommended: confirm Garmin Connect and the watch show the expected state.",
            ],
            error=None,
        )

    def _build_running_workout(self, garmin_payload: Dict[str, Any]):
        from garminconnect.workout import RunningWorkout

        return RunningWorkout.model_validate(garmin_payload)

    def _extract_workout_id(self, upload_result: Dict[str, Any]) -> Optional[str]:
        workout_id = upload_result.get("workoutId")
        if workout_id is None:
            return None

        return str(workout_id)

    def _extract_schedule_id(self, schedule_result: Any) -> Optional[str]:
        return self._find_first_value(
            schedule_result,
            ("workoutScheduleId", "scheduleId", "calendarEventId", "id"),
        )

    def _find_first_value(self, value: Any, keys: tuple[str, ...]) -> Optional[str]:
        if isinstance(value, dict):
            for key in keys:
                candidate = value.get(key)
                if isinstance(candidate, (int, str)):
                    return str(candidate)

            for nested_value in value.values():
                found = self._find_first_value(nested_value, keys)
                if found is not None:
                    return found

        if isinstance(value, list):
            for item in value:
                found = self._find_first_value(item, keys)
                if found is not None:
                    return found

        return None

    def _find_scheduled_workout_id(
        self,
        value: Any,
        garmin_workout_id: str,
    ) -> Optional[str]:
        if isinstance(value, dict):
            if self._dict_matches_workout_id(value, garmin_workout_id):
                scheduled_workout_id = self._find_first_value(
                    value,
                    (
                        "workoutScheduleId",
                        "scheduledWorkoutId",
                        "scheduleId",
                        "calendarEventId",
                        "id",
                    ),
                )
                if scheduled_workout_id is not None:
                    return scheduled_workout_id

            for nested_value in value.values():
                found = self._find_scheduled_workout_id(
                    nested_value,
                    garmin_workout_id,
                )
                if found is not None:
                    return found

        if isinstance(value, list):
            for item in value:
                found = self._find_scheduled_workout_id(item, garmin_workout_id)
                if found is not None:
                    return found

        return None

    def _dict_matches_workout_id(
        self,
        value: Dict[str, Any],
        garmin_workout_id: str,
    ) -> bool:
        for key in (
            "workoutId",
            "workout_id",
            "workoutKey",
            "garminWorkoutId",
            "garmin_workout_id",
        ):
            candidate = value.get(key)
            if isinstance(candidate, (int, str)) and str(candidate) == garmin_workout_id:
                return True

        return False
