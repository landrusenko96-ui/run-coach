from dataclasses import dataclass
from typing import Any, Dict, List

from app.models import (
    GarminPreviewStep,
    GarminWorkoutPreview,
    GarminWorkoutPublishRequest,
    TargetSummary,
    WorkoutStep,
)


@dataclass
class GarminWorkoutMappingResult:
    preview: GarminWorkoutPreview
    garmin_payload: Dict[str, Any]
    warnings: List[str]
    target_summary: TargetSummary
    step_count: int
    repeat_count: int
    pace_target_count: int
    hr_target_count: int


@dataclass
class MappingStats:
    step_count: int = 0
    repeat_count: int = 0
    pace_target_count: int = 0
    hr_target_count: int = 0
    estimated_duration_seconds: int = 0
    first_pace_target: TargetSummary | None = None


class GarminWorkoutMappingError(ValueError):
    def __init__(self, message: str, stats: MappingStats | None = None) -> None:
        super().__init__(message)
        self.stats = stats


class StepOrder:
    def __init__(self) -> None:
        self.value = 1

    def next(self) -> int:
        value = self.value
        self.value += 1
        return value


RUNNING_SPORT_TYPE = {
    "sportTypeId": 1,
    "sportTypeKey": "running",
    "displayOrder": 1,
}

STEP_TYPES = {
    "warmup": {"stepTypeId": 1, "stepTypeKey": "warmup", "displayOrder": 1},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2},
    "work": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
    "recovery": {"stepTypeId": 4, "stepTypeKey": "recovery", "displayOrder": 4},
    "rest": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
    "repeat": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
}

TIME_END_CONDITION = {
    "conditionTypeId": 2,
    "conditionTypeKey": "time",
    "displayOrder": 2,
    "displayable": True,
}

DISTANCE_END_CONDITION = {
    "conditionTypeId": 1,
    "conditionTypeKey": "distance",
    "displayOrder": 1,
    "displayable": True,
}

ITERATIONS_END_CONDITION = {
    "conditionTypeId": 7,
    "conditionTypeKey": "iterations",
    "displayOrder": 7,
    "displayable": False,
}

NO_TARGET = {
    "workoutTargetTypeId": 1,
    "workoutTargetTypeKey": "no.target",
    "displayOrder": 1,
}

PACE_TARGET = {
    "workoutTargetTypeId": 6,
    "workoutTargetTypeKey": "pace.zone",
    "displayOrder": 6,
}


def build_garmin_preview(
    workout: GarminWorkoutPublishRequest,
) -> GarminWorkoutMappingResult:
    warnings: List[str] = []
    stats = MappingStats()
    step_order = StepOrder()

    if workout.sport != "Run":
        raise GarminWorkoutMappingError("Only Run workouts are supported in this checkpoint.")

    if len(workout.structured_workout.steps) == 0:
        raise GarminWorkoutMappingError("Run workout must contain at least one executable step.")

    if workout.structured_workout.name != workout.workout_name:
        warnings.append(
            "structured_workout.name differs from workout_name; using workout_name for Garmin."
        )

    garmin_steps = [
        _map_step(step, stats=stats, step_order=step_order, repeat_depth=0)
        for step in workout.structured_workout.steps
    ]
    garmin_steps = [step for step in garmin_steps if step is not None]

    if stats.step_count == 0:
        raise GarminWorkoutMappingError(
            "Run workout must contain at least one executable step.",
            stats=stats,
        )

    if stats.pace_target_count == 0:
        raise GarminWorkoutMappingError(
            "Run workout must include at least one pace target before Garmin upload.",
            stats=stats,
        )

    target_summary = _build_target_summary(stats)
    garmin_payload = {
        "workoutName": workout.workout_name,
        "sportType": RUNNING_SPORT_TYPE,
        "estimatedDurationInSecs": stats.estimated_duration_seconds,
        "description": workout.structured_workout.description
        or (
            "Experimental Run Coach direct Garmin export. "
            "Verify pace target on Garmin watch before relying on it."
        ),
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": RUNNING_SPORT_TYPE,
                "workoutSteps": garmin_steps,
            }
        ],
    }

    _validate_running_workout_payload(garmin_payload)

    preview = GarminWorkoutPreview(
        planned_workout_id=workout.planned_workout_id,
        name=workout.workout_name,
        sport="RUNNING",
        scheduled_date=workout.workout_date.isoformat(),
        steps=_build_preview_steps(garmin_steps),
    )

    warnings.append(
        "Experimental Garmin direct export: API success still requires manual Garmin Connect and watch verification."
    )

    return GarminWorkoutMappingResult(
        preview=preview,
        garmin_payload=garmin_payload,
        warnings=warnings,
        target_summary=target_summary,
        step_count=stats.step_count,
        repeat_count=stats.repeat_count,
        pace_target_count=stats.pace_target_count,
        hr_target_count=stats.hr_target_count,
    )


def count_generated_steps(garmin_payload: Dict[str, Any]) -> int:
    return _count_payload_steps(garmin_payload.get("workoutSegments", []))


def _map_step(
    step: WorkoutStep,
    *,
    stats: MappingStats,
    step_order: StepOrder,
    repeat_depth: int,
) -> Dict[str, Any]:
    if step.repeat is not None:
        return _map_repeat_group(
            step,
            stats=stats,
            step_order=step_order,
            repeat_depth=repeat_depth,
        )

    return _map_executable_step(step, stats=stats, step_order=step_order)


def _map_repeat_group(
    step: WorkoutStep,
    *,
    stats: MappingStats,
    step_order: StepOrder,
    repeat_depth: int,
) -> Dict[str, Any]:
    if repeat_depth >= 1:
        raise GarminWorkoutMappingError(
            "Nested repeats are not supported in this checkpoint.",
            stats=stats,
        )

    if step.repeat is None or len(step.repeat.steps) == 0:
        raise GarminWorkoutMappingError(
            "Repeat blocks must include at least one repeated step.",
            stats=stats,
        )

    stats.repeat_count += 1
    group_order = step_order.next()
    duration_before_children = stats.estimated_duration_seconds
    child_steps = [
        _map_step(child_step, stats=stats, step_order=step_order, repeat_depth=repeat_depth + 1)
        for child_step in step.repeat.steps
    ]
    child_duration_seconds = stats.estimated_duration_seconds - duration_before_children
    stats.estimated_duration_seconds += child_duration_seconds * (step.repeat.count - 1)

    return {
        "type": "RepeatGroupDTO",
        "stepOrder": group_order,
        "stepType": STEP_TYPES["repeat"],
        "numberOfIterations": step.repeat.count,
        "workoutSteps": child_steps,
        "endCondition": ITERATIONS_END_CONDITION,
        "endConditionValue": float(step.repeat.count),
        "smartRepeat": False,
    }


def _map_executable_step(
    step: WorkoutStep,
    *,
    stats: MappingStats,
    step_order: StepOrder,
) -> Dict[str, Any]:
    if step.durationType == "open":
        raise GarminWorkoutMappingError(
            "Open duration is only supported on repeat wrapper steps.",
            stats=stats,
        )

    target_fields, pace_summary = _build_target_fields(step, stats)
    end_condition, end_condition_value = _build_end_condition(step, stats)
    stats.estimated_duration_seconds += _estimate_step_duration_seconds(
        step,
        pace_summary,
    )
    stats.step_count += 1

    return {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order.next(),
        "stepType": STEP_TYPES[step.type],
        "description": step.name,
        "endCondition": end_condition,
        "endConditionValue": end_condition_value,
        **target_fields,
    }


def _build_end_condition(
    step: WorkoutStep,
    stats: MappingStats,
) -> tuple[Dict[str, Any], float]:
    if step.durationValue is None or step.durationValue <= 0:
        raise GarminWorkoutMappingError(
            "Every non-open executable step must include a positive durationValue.",
            stats=stats,
        )

    if step.durationType == "time" and step.durationUnit == "seconds":
        return TIME_END_CONDITION, float(step.durationValue)

    if step.durationType == "distance" and step.durationUnit == "meters":
        return DISTANCE_END_CONDITION, float(step.durationValue)

    raise GarminWorkoutMappingError(
        "Unsupported duration. Use time+seconds or distance+meters for executable steps.",
        stats=stats,
    )


def _build_target_fields(
    step: WorkoutStep,
    stats: MappingStats,
) -> tuple[Dict[str, Any], TargetSummary | None]:
    target_type = step.targetType or "none"

    if target_type == "none":
        return {"targetType": NO_TARGET}, None

    if target_type == "pace":
        pace_summary = _get_pace_target(step, stats)
        stats.pace_target_count += 1
        if stats.first_pace_target is None:
            stats.first_pace_target = pace_summary

        slower_speed_mps = 1000 / pace_summary.target_max
        faster_speed_mps = 1000 / pace_summary.target_min
        return (
            {
                "targetType": PACE_TARGET,
                "targetValueOne": round(slower_speed_mps, 3),
                "targetValueTwo": round(faster_speed_mps, 3),
                "targetValueUnitKey": "metersPerSecond",
            },
            pace_summary,
        )

    if target_type == "heart_rate":
        stats.hr_target_count += 1
        raise GarminWorkoutMappingError(
            "Heart-rate targets are counted but not supported for direct Garmin upload yet.",
            stats=stats,
        )

    if target_type == "rpe":
        raise GarminWorkoutMappingError(
            "RPE targets are not supported for direct Garmin upload.",
            stats=stats,
        )

    raise GarminWorkoutMappingError(f"Unsupported target type: {target_type}.", stats=stats)


def _get_pace_target(step: WorkoutStep, stats: MappingStats) -> TargetSummary:
    if step.targetUnit != "sec_per_km":
        raise GarminWorkoutMappingError(
            "Every pace target must use targetUnit sec_per_km.",
            stats=stats,
        )

    if step.targetMin is None or step.targetMax is None:
        raise GarminWorkoutMappingError(
            "Every pace-targeted step must include targetMin and targetMax.",
            stats=stats,
        )

    if step.targetMin <= 0 or step.targetMax <= 0:
        raise GarminWorkoutMappingError(
            "Pace target min and max must be positive.",
            stats=stats,
        )

    if step.targetMin > step.targetMax:
        raise GarminWorkoutMappingError(
            "Pace target min must be faster than or equal to pace target max.",
            stats=stats,
        )

    return TargetSummary(
        target_type="pace",
        target_min=float(step.targetMin),
        target_max=float(step.targetMax),
        target_unit=step.targetUnit,
        display=(
            f"pace: {_format_number(step.targetMin)}-{_format_number(step.targetMax)} "
            f"{step.targetUnit}"
        ),
    )


def _estimate_step_duration_seconds(
    step: WorkoutStep,
    pace_summary: TargetSummary | None,
) -> int:
    if step.durationType == "time" and step.durationValue is not None:
        return int(step.durationValue)

    if (
        step.durationType == "distance"
        and step.durationValue is not None
        and pace_summary is not None
        and pace_summary.target_min is not None
        and pace_summary.target_max is not None
    ):
        average_pace_seconds_per_km = (
            pace_summary.target_min + pace_summary.target_max
        ) / 2
        return int((step.durationValue / 1000) * average_pace_seconds_per_km)

    return 0


def _build_target_summary(stats: MappingStats) -> TargetSummary:
    if stats.first_pace_target is None:
        return TargetSummary()

    if stats.pace_target_count == 1:
        return stats.first_pace_target

    return TargetSummary(
        target_type="pace",
        target_min=stats.first_pace_target.target_min,
        target_max=stats.first_pace_target.target_max,
        target_unit=stats.first_pace_target.target_unit,
        display=(
            f"{stats.pace_target_count} pace targets; first: "
            f"{stats.first_pace_target.display}"
        ),
    )


def _build_preview_steps(garmin_steps: List[Dict[str, Any]]) -> List[GarminPreviewStep]:
    preview_steps: List[GarminPreviewStep] = []
    _append_preview_steps(garmin_steps, preview_steps, repeat_depth=0)
    return preview_steps


def _append_preview_steps(
    garmin_steps: List[Dict[str, Any]],
    preview_steps: List[GarminPreviewStep],
    *,
    repeat_depth: int,
) -> None:
    for step in garmin_steps:
        if step.get("type") == "RepeatGroupDTO":
            preview_steps.append(
                GarminPreviewStep(
                    order=int(step["stepOrder"]),
                    step_type="repeat",
                    name=f"Repeat {step.get('numberOfIterations', 0)} times",
                    duration=f"{step.get('numberOfIterations', 0)} iterations",
                    target="repeat group",
                    repeat_depth=repeat_depth,
                )
            )
            _append_preview_steps(
                step.get("workoutSteps", []),
                preview_steps,
                repeat_depth=repeat_depth + 1,
            )
            continue

        preview_steps.append(
            GarminPreviewStep(
                order=int(step["stepOrder"]),
                step_type=str(step["stepType"]["stepTypeKey"]),
                name=str(step.get("description", "Workout step")),
                duration=_format_payload_duration(step),
                target=_format_payload_target(step),
                repeat_depth=repeat_depth,
            )
        )


def _format_payload_duration(step: Dict[str, Any]) -> str:
    condition = step.get("endCondition", {})
    value = _format_number(float(step.get("endConditionValue", 0)))
    key = condition.get("conditionTypeKey", "unknown")
    if key == "time":
        return f"{value} seconds"
    if key == "distance":
        return f"{value} meters"

    return f"{value} {key}"


def _format_payload_target(step: Dict[str, Any]) -> str:
    target = step.get("targetType", {})
    if target.get("workoutTargetTypeKey") == "pace.zone":
        return "pace.zone"

    return target.get("workoutTargetTypeKey", "no.target")


def _count_payload_steps(value: Any) -> int:
    count = 0
    if isinstance(value, list):
        for item in value:
            count += _count_payload_steps(item)
        return count

    if isinstance(value, dict):
        if value.get("type") == "ExecutableStepDTO":
            return 1
        return _count_payload_steps(value.get("workoutSteps", []))

    return 0


def _validate_running_workout_payload(garmin_payload: Dict[str, Any]) -> None:
    try:
        from garminconnect.workout import RunningWorkout

        RunningWorkout.model_validate(garmin_payload)
    except Exception as error:
        raise GarminWorkoutMappingError(
            f"Generated Garmin workout payload failed local validation: {type(error).__name__}."
        ) from error


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))

    return str(value)
