from typing import Any, Dict, List, Optional, Tuple

from app.models import GarminPreviewStep, GarminWorkoutPreview, PlannedWorkoutPayload


class GarminWorkoutMappingError(ValueError):
    pass


RUNNING_SPORT_TYPE = {
    "sportTypeId": 1,
    "sportTypeKey": "running",
    "displayOrder": 1,
}


def build_garmin_preview(
    workout: PlannedWorkoutPayload,
    schedule_date: Optional[str] = None,
) -> Tuple[GarminWorkoutPreview, Dict[str, Any], List[str]]:
    warnings: List[str] = []
    raw_step = _get_single_supported_step(workout)
    duration_seconds = _get_duration_seconds(raw_step)
    pace_target = _get_pace_target(raw_step)

    preview = GarminWorkoutPreview(
        source_planned_workout_id=workout.planned_workout_id,
        name=workout.title,
        sport="RUNNING",
        scheduled_date=schedule_date or workout.workout_date,
        workout_type=workout.workout_type,
        steps=[
            GarminPreviewStep(
                order=1,
                step_type=str(raw_step.get("type", "work")),
                name=str(raw_step.get("name", "Easy run")),
                duration=f"{duration_seconds} seconds",
                target=(
                    f"pace: {pace_target['targetMin']}-{pace_target['targetMax']} "
                    f"{pace_target['targetUnit']}"
                ),
                repeat_depth=0,
            )
        ],
    )

    garmin_payload = _build_running_workout_payload(
        workout=workout,
        step=raw_step,
        duration_seconds=duration_seconds,
        pace_target=pace_target,
    )

    warnings.append(
        "Experimental Garmin direct export: API success still requires manual Garmin Connect and watch verification."
    )

    return preview, garmin_payload, warnings


def _get_single_supported_step(workout: PlannedWorkoutPayload) -> Dict[str, Any]:
    if workout.sport.lower() != "run":
        raise GarminWorkoutMappingError("Only Run workouts are supported in this checkpoint.")

    structured_workout = workout.structured_workout or {}
    raw_steps = structured_workout.get("steps", [])

    if not isinstance(raw_steps, list) or len(raw_steps) == 0:
        raise GarminWorkoutMappingError("Structured workout must contain one step.")

    if len(raw_steps) != 1:
        raise GarminWorkoutMappingError(
            "Only one-step running workouts are supported in this checkpoint."
        )

    step = raw_steps[0]
    if not isinstance(step, dict):
        raise GarminWorkoutMappingError("Workout step must be an object.")

    if "repeat" in step:
        raise GarminWorkoutMappingError("Repeats are not supported in this checkpoint.")

    step_type = str(step.get("type", "")).lower()
    if step_type != "work":
        raise GarminWorkoutMappingError("Only one work step is supported in this checkpoint.")

    return step


def _get_duration_seconds(step: Dict[str, Any]) -> int:
    duration_type = step.get("durationType") or step.get("duration_type")
    duration_value = step.get("durationValue") or step.get("duration_value")
    duration_unit = step.get("durationUnit") or step.get("duration_unit")

    if duration_type == "open":
        raise GarminWorkoutMappingError("Open duration is not supported in this checkpoint.")

    if duration_type != "time" or duration_unit != "seconds":
        raise GarminWorkoutMappingError(
            "Only time duration in seconds is supported in this checkpoint."
        )

    if not isinstance(duration_value, (int, float)) or duration_value <= 0:
        raise GarminWorkoutMappingError("Step duration must be a positive number of seconds.")

    return int(duration_value)


def _get_pace_target(step: Dict[str, Any]) -> Dict[str, Any]:
    target_type = step.get("targetType") or step.get("target_type")
    target_min = step.get("targetMin") or step.get("target_min")
    target_max = step.get("targetMax") or step.get("target_max")
    target_unit = step.get("targetUnit") or step.get("target_unit")

    if target_type != "pace" or target_unit != "sec_per_km":
        raise GarminWorkoutMappingError(
            "Only pace targets in sec_per_km are supported in this checkpoint."
        )

    if not isinstance(target_min, (int, float)) or not isinstance(target_max, (int, float)):
        raise GarminWorkoutMappingError("Pace target min and max must be numeric.")

    if target_min <= 0 or target_max <= 0:
        raise GarminWorkoutMappingError("Pace target min and max must be positive.")

    if target_min > target_max:
        raise GarminWorkoutMappingError(
            "Pace target min must be faster than or equal to pace target max."
        )

    return {
        "targetMin": float(target_min),
        "targetMax": float(target_max),
        "targetUnit": target_unit,
    }


def _build_running_workout_payload(
    *,
    workout: PlannedWorkoutPayload,
    step: Dict[str, Any],
    duration_seconds: int,
    pace_target: Dict[str, Any],
) -> Dict[str, Any]:
    slower_speed_mps = 1000 / pace_target["targetMax"]
    faster_speed_mps = 1000 / pace_target["targetMin"]

    return {
        "workoutName": workout.title,
        "sportType": RUNNING_SPORT_TYPE,
        "estimatedDurationInSecs": duration_seconds,
        "description": (
            "Experimental Run Coach direct Garmin export. "
            "Verify pace target on Garmin watch before relying on it."
        ),
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": RUNNING_SPORT_TYPE,
                "workoutSteps": [
                    {
                        "type": "ExecutableStepDTO",
                        "stepOrder": 1,
                        "stepType": {
                            "stepTypeId": 3,
                            "stepTypeKey": "interval",
                            "displayOrder": 3,
                        },
                        "description": str(step.get("name", "Easy run")),
                        "endCondition": {
                            "conditionTypeId": 2,
                            "conditionTypeKey": "time",
                            "displayOrder": 2,
                            "displayable": True,
                        },
                        "endConditionValue": duration_seconds,
                        "targetType": {
                            "workoutTargetTypeId": 6,
                            "workoutTargetTypeKey": "pace.zone",
                            "displayOrder": 6,
                        },
                        "targetValueOne": round(slower_speed_mps, 3),
                        "targetValueTwo": round(faster_speed_mps, 3),
                        "targetValueUnitKey": "metersPerSecond",
                    }
                ],
            }
        ],
    }
