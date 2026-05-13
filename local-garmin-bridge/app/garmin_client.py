from typing import Any, Dict, Optional

from app.garmin_auth import GarminAuthService
from app.models import GarminWorkoutPreview, GarminWorkoutPublishResponse


class GarminClient:
    """Local-only Garmin client for the experimental direct export path."""

    def __init__(self, auth_service: Optional[GarminAuthService] = None) -> None:
        self.auth_service = auth_service or GarminAuthService()

    def publish_workout(
        self,
        preview: GarminWorkoutPreview,
        garmin_payload: Dict[str, Any],
    ) -> GarminWorkoutPublishResponse:
        try:
            client = self.auth_service.resume_client()
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="not_authenticated",
                message=(
                    "A local Garmin session could not be resumed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                garmin_workout_id=None,
                schedule_result=None,
                preview=preview,
                garmin_payload=garmin_payload,
                warnings=["Authenticate locally before publishing to Garmin."],
            )

        try:
            running_workout = self._build_running_workout(garmin_payload)
            upload_result = client.upload_running_workout(running_workout)
            garmin_workout_id = self._extract_workout_id(upload_result)
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="upload_failed",
                message=(
                    "Garmin workout upload failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                garmin_workout_id=None,
                schedule_result=None,
                preview=preview,
                garmin_payload=garmin_payload,
                warnings=["No schedule request was made because upload did not complete."],
            )

        if garmin_workout_id is None:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="upload_failed",
                message="Garmin upload response did not include a workoutId.",
                garmin_workout_id=None,
                schedule_result=None,
                preview=preview,
                garmin_payload=garmin_payload,
                warnings=["No schedule request was made because workoutId was unavailable."],
            )

        try:
            schedule_result = client.schedule_workout(
                garmin_workout_id,
                preview.scheduled_date,
            )
        except Exception as error:
            return GarminWorkoutPublishResponse(
                ok=False,
                status="schedule_failed",
                message=(
                    "Garmin workout uploaded, but scheduling failed. "
                    f"Safe error category: {self.auth_service.safe_error_category(error)}."
                ),
                garmin_workout_id=str(garmin_workout_id),
                schedule_result=None,
                preview=preview,
                garmin_payload=garmin_payload,
                warnings=[
                    "Workout may exist in Garmin Connect workout library even though scheduling failed."
                ],
            )

        return GarminWorkoutPublishResponse(
            ok=True,
            status="published",
            message=(
                "Garmin API accepted the workout upload and schedule request. "
                "Manual Garmin Connect and watch verification is still required."
            ),
            garmin_workout_id=str(garmin_workout_id),
            schedule_result=schedule_result if isinstance(schedule_result, dict) else {},
            preview=preview,
            garmin_payload=garmin_payload,
            warnings=[
                "Manual verification required: confirm Garmin Connect and the watch show a pace target, not No Target.",
                "Duplicate prevention is not implemented; repeated publish calls can create duplicate Garmin workouts.",
            ],
        )

    def _build_running_workout(self, garmin_payload: Dict[str, Any]):
        from garminconnect.workout import RunningWorkout

        return RunningWorkout.model_validate(garmin_payload)

    def _extract_workout_id(self, upload_result: Dict[str, Any]) -> Optional[str]:
        workout_id = upload_result.get("workoutId")
        if workout_id is None:
            return None

        return str(workout_id)
