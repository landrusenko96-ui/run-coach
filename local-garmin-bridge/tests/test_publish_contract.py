import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("GARMIN_BRIDGE_API_KEY", "test-local-key")

from pydantic import ValidationError

from app.garmin_client import GarminClient
from app.main import delete_workout, preview_workout, publish_workout
from app.models import (
    DebugSummary,
    GarminWorkoutDeleteRequest,
    GarminWorkoutPublishRequest,
)
from app.workout_mapper import build_garmin_preview


def sample_payload():
    return {
        "planned_workout_id": "manual-garmin-test-1",
        "workout_name": "Run Coach Garmin Pace Test",
        "workout_date": "2026-05-20",
        "sport": "Run",
        "source_app_version": "0.1.0",
        "dry_run": True,
        "structured_workout": {
            "version": 1,
            "sport": "Run",
            "name": "Run Coach Garmin Pace Test",
            "exportSafe": True,
            "exportWarnings": [],
            "steps": [
                {
                    "id": "easy-run",
                    "type": "work",
                    "name": "Easy run",
                    "durationType": "time",
                    "durationValue": 1800,
                    "durationUnit": "seconds",
                    "targetType": "pace",
                    "targetMin": 360,
                    "targetMax": 420,
                    "targetUnit": "sec_per_km",
                }
            ],
        },
    }


def sample_delete_payload():
    return {
        "planned_workout_id": "manual-garmin-test-1",
        "garmin_workout_id": "12345",
        "schedule_date": "2999-01-01",
    }


def preview_data(payload):
    request = GarminWorkoutPublishRequest.model_validate(payload)
    return preview_workout(request).model_dump(mode="json")


class FakeAuthService:
    def __init__(self, session=None, error=None):
        self.session = session
        self.error = error
        self.resume_count = 0

    def resume_client(self):
        self.resume_count += 1
        if self.error is not None:
            raise self.error

        return self.session

    def safe_error_category(self, error):
        return f"SAFE_{type(error).__name__}"


class FakeGarminSession:
    def __init__(
        self,
        upload_result=None,
        schedule_result=None,
        upload_error=None,
        schedule_error=None,
        delete_error=None,
    ):
        self.upload_result = upload_result or {"workoutId": "12345"}
        self.schedule_result = schedule_result or {"workoutScheduleId": "67890"}
        self.upload_error = upload_error
        self.schedule_error = schedule_error
        self.delete_error = delete_error
        self.upload_count = 0
        self.schedule_count = 0
        self.delete_count = 0

    def upload_running_workout(self, running_workout):
        self.upload_count += 1
        if self.upload_error is not None:
            raise self.upload_error

        return self.upload_result

    def schedule_workout(self, workout_id, scheduled_date):
        self.schedule_count += 1
        if self.schedule_error is not None:
            raise self.schedule_error

        return self.schedule_result

    def delete_workout(self, workout_id):
        self.delete_count += 1
        if self.delete_error is not None:
            raise self.delete_error

        return {}


class FakeUnsupportedGarminSession:
    pass


class FakeUnscheduleOnlySession:
    def __init__(
        self,
        schedule_lookup_result=None,
        schedule_lookup_error=None,
        unschedule_error=None,
    ):
        self.schedule_lookup_result = schedule_lookup_result or {
            "scheduledWorkouts": [
                {
                    "workoutScheduleId": "67890",
                    "workoutId": "12345",
                }
            ]
        }
        self.schedule_lookup_error = schedule_lookup_error
        self.unschedule_error = unschedule_error
        self.schedule_lookup_count = 0
        self.unschedule_count = 0
        self.unscheduled_workout_id = None

    def get_scheduled_workouts(self, year, month):
        self.schedule_lookup_count += 1
        if self.schedule_lookup_error is not None:
            raise self.schedule_lookup_error

        return self.schedule_lookup_result

    def unschedule_workout(self, scheduled_workout_id):
        self.unschedule_count += 1
        self.unscheduled_workout_id = scheduled_workout_id
        if self.unschedule_error is not None:
            raise self.unschedule_error

        return {}


def real_publish_data(auth_service):
    payload = sample_payload()
    payload["dry_run"] = False
    request = GarminWorkoutPublishRequest.model_validate(payload)
    result = build_garmin_preview(request)
    response = GarminClient(auth_service=auth_service).publish_workout(
        request=request,
        preview=result.preview,
        garmin_payload=result.garmin_payload,
        warnings=result.warnings,
        target_summary=result.target_summary,
        debug_summary=DebugSummary(
            dry_run=False,
            client_version="0.3.3",
            generated_step_count=result.step_count,
        ),
    )

    return response.model_dump(mode="json")


def delete_data(auth_service, payload=None):
    request = GarminWorkoutDeleteRequest.model_validate(
        payload or sample_delete_payload()
    )
    response = GarminClient(auth_service=auth_service).delete_workout(request)

    return response.model_dump(mode="json")


class GarminPublishContractTest(unittest.TestCase):
    def test_flat_app_native_request_parses(self):
        request = GarminWorkoutPublishRequest.model_validate(sample_payload())

        self.assertEqual(request.planned_workout_id, "manual-garmin-test-1")
        self.assertEqual(request.workout_name, "Run Coach Garmin Pace Test")
        self.assertEqual(request.structured_workout.steps[0].targetType, "pace")

    def test_optional_export_fields_are_accepted(self):
        request = GarminWorkoutPublishRequest.model_validate(sample_payload())

        self.assertTrue(request.structured_workout.exportSafe)
        self.assertEqual(request.structured_workout.exportWarnings, [])

    def test_old_nested_shape_is_rejected(self):
        with self.assertRaises(ValidationError):
            GarminWorkoutPublishRequest.model_validate({"workout": sample_payload()})

    def test_invalid_date_is_rejected(self):
        payload = sample_payload()
        payload["workout_date"] = "2026-05-20T00:00:00"

        with self.assertRaises(ValidationError):
            GarminWorkoutPublishRequest.model_validate(payload)

    def test_non_run_sport_is_rejected(self):
        payload = sample_payload()
        payload["sport"] = "Bike"

        with self.assertRaises(ValidationError):
            GarminWorkoutPublishRequest.model_validate(payload)

    def test_unknown_extra_request_field_is_rejected(self):
        payload = sample_payload()
        payload["workout_type"] = "easy"

        with self.assertRaises(ValidationError):
            GarminWorkoutPublishRequest.model_validate(payload)

    def test_easy_run_with_pace_target_previews_successfully(self):
        data = preview_data(sample_payload())

        self.assertTrue(data["ok"])
        self.assertEqual(data["step_count"], 1)
        self.assertEqual(data["repeat_count"], 0)
        self.assertEqual(data["pace_target_count"], 1)
        self.assertEqual(data["hr_target_count"], 0)
        self.assertEqual(data["target_summary"]["display"], "pace: 360-420 sec_per_km")
        self.assertIsNotNone(data["garmin_payload_preview"])

    def test_long_run_with_distance_and_pace_target_previews_successfully(self):
        payload = sample_payload()
        payload["workout_name"] = "Run Coach Long Run"
        payload["structured_workout"]["name"] = "Run Coach Long Run"
        payload["structured_workout"]["steps"][0]["name"] = "Long run"
        payload["structured_workout"]["steps"][0]["durationType"] = "distance"
        payload["structured_workout"]["steps"][0]["durationValue"] = 10000
        payload["structured_workout"]["steps"][0]["durationUnit"] = "meters"

        data = preview_data(payload)

        self.assertTrue(data["ok"])
        self.assertEqual(data["step_count"], 1)
        self.assertEqual(data["pace_target_count"], 1)
        step = data["garmin_payload_preview"]["workoutSegments"][0]["workoutSteps"][0]
        self.assertEqual(step["endCondition"]["conditionTypeKey"], "distance")
        self.assertEqual(step["endConditionValue"], 10000.0)

    def test_interval_repeat_with_pace_target_previews_successfully(self):
        payload = sample_payload()
        payload["workout_name"] = "Run Coach Interval Test"
        payload["structured_workout"]["name"] = "Run Coach Interval Test"
        payload["structured_workout"]["steps"] = [
            {
                "id": "interval-warmup",
                "type": "warmup",
                "name": "Warm up",
                "durationType": "time",
                "durationValue": 600,
                "durationUnit": "seconds",
                "targetType": "none",
            },
            {
                "id": "interval-repeat",
                "type": "work",
                "name": "3 x interval set",
                "durationType": "open",
                "targetType": "none",
                "repeat": {
                    "count": 3,
                    "steps": [
                        {
                            "id": "interval-work",
                            "type": "work",
                            "name": "Fast interval",
                            "durationType": "time",
                            "durationValue": 180,
                            "durationUnit": "seconds",
                            "targetType": "pace",
                            "targetMin": 300,
                            "targetMax": 330,
                            "targetUnit": "sec_per_km",
                        },
                        {
                            "id": "interval-recovery",
                            "type": "recovery",
                            "name": "Recovery jog",
                            "durationType": "time",
                            "durationValue": 120,
                            "durationUnit": "seconds",
                            "targetType": "none",
                        },
                    ],
                },
            },
            {
                "id": "interval-cooldown",
                "type": "cooldown",
                "name": "Cool down",
                "durationType": "time",
                "durationValue": 600,
                "durationUnit": "seconds",
                "targetType": "none",
            },
        ]

        data = preview_data(payload)

        self.assertTrue(data["ok"])
        self.assertEqual(data["step_count"], 4)
        self.assertEqual(data["repeat_count"], 1)
        self.assertEqual(data["pace_target_count"], 1)
        workout_steps = data["garmin_payload_preview"]["workoutSegments"][0]["workoutSteps"]
        self.assertEqual(workout_steps[1]["type"], "RepeatGroupDTO")
        self.assertEqual(workout_steps[1]["numberOfIterations"], 3)

    def test_missing_pace_target_fails_before_garmin_call(self):
        payload = sample_payload()
        payload["structured_workout"]["steps"][0]["targetType"] = "none"
        payload["structured_workout"]["steps"][0].pop("targetMin")
        payload["structured_workout"]["steps"][0].pop("targetMax")
        payload["structured_workout"]["steps"][0].pop("targetUnit")

        data = preview_data(payload)

        self.assertFalse(data["ok"])
        self.assertIn("at least one pace target", data["error"])
        self.assertIsNone(data["garmin_payload_preview"])

    def test_unsupported_duration_fails_before_garmin_call(self):
        payload = sample_payload()
        payload["structured_workout"]["steps"][0].pop("durationValue")

        data = preview_data(payload)

        self.assertFalse(data["ok"])
        self.assertIn("durationValue", data["error"])
        self.assertIsNone(data["garmin_payload_preview"])

    def test_nested_repeat_fails_clearly(self):
        payload = sample_payload()
        payload["structured_workout"]["steps"] = [
            {
                "id": "outer-repeat",
                "type": "work",
                "name": "Outer repeat",
                "durationType": "open",
                "targetType": "none",
                "repeat": {
                    "count": 2,
                    "steps": [
                        {
                            "id": "inner-repeat",
                            "type": "work",
                            "name": "Inner repeat",
                            "durationType": "open",
                            "targetType": "none",
                            "repeat": {
                                "count": 2,
                                "steps": [
                                    {
                                        "id": "inner-work",
                                        "type": "work",
                                        "name": "Inner work",
                                        "durationType": "time",
                                        "durationValue": 60,
                                        "durationUnit": "seconds",
                                        "targetType": "pace",
                                        "targetMin": 300,
                                        "targetMax": 330,
                                        "targetUnit": "sec_per_km",
                                    }
                                ],
                            },
                        }
                    ],
                },
            }
        ]

        data = preview_data(payload)

        self.assertFalse(data["ok"])
        self.assertIn("Nested repeats", data["error"])

    def test_preview_response_does_not_expose_secret_fields(self):
        data = preview_data(sample_payload())
        raw_response = json.dumps(data).lower()

        for forbidden in [
            "garmin_tokens",
            "cookie",
            "password",
            "authorization",
            "x-garmin-bridge-key",
            "access_token",
            "refresh_token",
        ]:
            self.assertNotIn(forbidden, raw_response)

    def test_dry_run_publish_maps_without_garmin_call(self):
        request = GarminWorkoutPublishRequest.model_validate(sample_payload())
        with patch("app.main.GarminClient") as garmin_client_class:
            response = publish_workout(request)

        data = response.model_dump(mode="json")

        garmin_client_class.assert_not_called()
        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "DRY_RUN")
        self.assertEqual(data["planned_workout_id"], "manual-garmin-test-1")
        self.assertIsNone(data["garmin_workout_id"])
        self.assertIsNone(data["garmin_schedule_id"])
        self.assertEqual(data["scheduled_date"], "2026-05-20")
        self.assertEqual(data["target_summary"]["target_type"], "pace")
        self.assertEqual(data["target_summary"]["display"], "pace: 360-420 sec_per_km")
        self.assertTrue(data["debug_summary"]["dry_run"])
        self.assertEqual(data["debug_summary"]["generated_step_count"], 1)
        self.assertNotIn("garmin_payload", data)
        self.assertNotIn("schedule_result", data)
        self.assertNotIn("preview", data)

    def test_unsupported_workout_shape_returns_invalid_workout(self):
        payload = sample_payload()
        payload["structured_workout"]["steps"][0]["targetType"] = "heart_rate"
        payload["structured_workout"]["steps"][0]["targetMin"] = 120
        payload["structured_workout"]["steps"][0]["targetMax"] = 150
        payload["structured_workout"]["steps"][0]["targetUnit"] = "bpm"

        request = GarminWorkoutPublishRequest.model_validate(payload)
        with patch("app.main.GarminClient") as garmin_client_class:
            response = publish_workout(request)

        data = response.model_dump(mode="json")

        garmin_client_class.assert_not_called()
        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "INVALID_WORKOUT")
        self.assertEqual(data["planned_workout_id"], "manual-garmin-test-1")
        self.assertIn("Heart-rate targets", data["error"])

    def test_auth_failure_returns_auth_required_without_upload(self):
        auth_service = FakeAuthService(error=RuntimeError("expired session"))

        data = real_publish_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "AUTH_REQUIRED")
        self.assertIn("SAFE_RuntimeError", data["error"])
        self.assertEqual(auth_service.resume_count, 1)

    def test_upload_rejection_returns_garmin_rejected(self):
        session = FakeGarminSession(upload_error=RuntimeError("429 full raw body hidden"))
        auth_service = FakeAuthService(session=session)

        data = real_publish_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "GARMIN_REJECTED")
        self.assertIsNone(data["garmin_workout_id"])
        self.assertEqual(session.upload_count, 1)
        self.assertEqual(session.schedule_count, 0)

    def test_upload_without_workout_id_returns_garmin_rejected(self):
        session = FakeGarminSession(upload_result={"unexpected": "shape"})
        auth_service = FakeAuthService(session=session)

        data = real_publish_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "GARMIN_REJECTED")
        self.assertIsNone(data["garmin_workout_id"])
        self.assertEqual(session.schedule_count, 0)

    def test_schedule_failure_returns_uploaded_not_scheduled(self):
        session = FakeGarminSession(
            upload_result={"workoutId": "12345"},
            schedule_error=RuntimeError("schedule rejected"),
        )
        auth_service = FakeAuthService(session=session)

        data = real_publish_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "UPLOADED_NOT_SCHEDULED")
        self.assertEqual(data["garmin_workout_id"], "12345")
        self.assertIsNone(data["garmin_schedule_id"])
        self.assertEqual(data["schedule_summary"]["result_type"], "NOT_SCHEDULED")
        self.assertIn("manual cleanup", " ".join(data["warnings"]))

    def test_upload_and_schedule_success_returns_published(self):
        session = FakeGarminSession(
            upload_result={"workoutId": "12345"},
            schedule_result={"workoutScheduleId": "67890"},
        )
        auth_service = FakeAuthService(session=session)

        data = real_publish_data(auth_service)

        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "PUBLISHED")
        self.assertEqual(data["garmin_workout_id"], "12345")
        self.assertEqual(data["garmin_schedule_id"], "67890")
        self.assertEqual(data["schedule_summary"]["result_type"], "SCHEDULED")
        self.assertEqual(data["schedule_summary"]["garmin_schedule_id"], "67890")

    def test_publish_response_does_not_expose_secret_fields(self):
        session = FakeGarminSession()
        auth_service = FakeAuthService(session=session)

        data = real_publish_data(auth_service)
        raw_response = json.dumps(data).lower()

        for forbidden in [
            "garmin_tokens",
            "cookie",
            "password",
            "authorization",
            "x-garmin-bridge-key",
            "access_token",
            "refresh_token",
        ]:
            self.assertNotIn(forbidden, raw_response)

    def test_missing_export_fields_are_allowed(self):
        payload = sample_payload()
        del payload["structured_workout"]["exportSafe"]
        del payload["structured_workout"]["exportWarnings"]

        try:
            request = GarminWorkoutPublishRequest.model_validate(payload)
        except ValidationError as error:
            self.fail(f"Optional export fields should not be required: {error}")

        self.assertIsNone(request.structured_workout.exportSafe)
        self.assertEqual(request.structured_workout.exportWarnings, [])

    def test_valid_delete_request_parses(self):
        request = GarminWorkoutDeleteRequest.model_validate(sample_delete_payload())

        self.assertEqual(request.planned_workout_id, "manual-garmin-test-1")
        self.assertEqual(request.garmin_workout_id, "12345")
        self.assertEqual(request.schedule_date.isoformat(), "2999-01-01")

    def test_missing_schedule_date_blocks_before_auth(self):
        payload = sample_delete_payload()
        del payload["schedule_date"]
        auth_service = FakeAuthService(session=FakeGarminSession())

        data = delete_data(auth_service, payload)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "SCHEDULE_DATE_REQUIRED")
        self.assertEqual(auth_service.resume_count, 0)
        self.assertIn("schedule_date", data["error"])

    def test_past_schedule_date_blocks_before_auth(self):
        payload = sample_delete_payload()
        payload["schedule_date"] = "2000-01-01"
        auth_service = FakeAuthService(session=FakeGarminSession())

        data = delete_data(auth_service, payload)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "PAST_WORKOUT_BLOCKED")
        self.assertEqual(auth_service.resume_count, 0)
        self.assertIn("past Garmin workouts", data["error"])

    def test_delete_auth_failure_returns_auth_required(self):
        auth_service = FakeAuthService(error=RuntimeError("expired session"))

        data = delete_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "AUTH_REQUIRED")
        self.assertIn("SAFE_RuntimeError", data["error"])
        self.assertEqual(auth_service.resume_count, 1)

    def test_delete_not_supported_when_library_has_no_delete_or_unschedule(self):
        auth_service = FakeAuthService(session=FakeUnsupportedGarminSession())

        data = delete_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "NOT_SUPPORTED")
        self.assertIn("not supported", data["error"])

    def test_delete_workout_success_returns_deleted(self):
        session = FakeGarminSession()
        auth_service = FakeAuthService(session=session)

        data = delete_data(auth_service)

        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "DELETED")
        self.assertEqual(data["planned_workout_id"], "manual-garmin-test-1")
        self.assertEqual(data["garmin_workout_id"], "12345")
        self.assertEqual(session.delete_count, 1)
        self.assertIn("Manual verification", " ".join(data["warnings"]))

    def test_delete_workout_exception_returns_garmin_rejected(self):
        session = FakeGarminSession(delete_error=RuntimeError("raw response hidden"))
        auth_service = FakeAuthService(session=session)

        data = delete_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "GARMIN_REJECTED")
        self.assertEqual(session.delete_count, 1)
        self.assertIn("SAFE_RuntimeError", data["error"])

    def test_unschedule_fallback_returns_unscheduled_only(self):
        session = FakeUnscheduleOnlySession()
        auth_service = FakeAuthService(session=session)

        data = delete_data(auth_service)

        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "UNSCHEDULED_ONLY")
        self.assertEqual(session.schedule_lookup_count, 1)
        self.assertEqual(session.unschedule_count, 1)
        self.assertEqual(session.unscheduled_workout_id, "67890")
        self.assertIn("may still exist", " ".join(data["warnings"]))

    def test_unschedule_fallback_returns_schedule_not_found(self):
        session = FakeUnscheduleOnlySession(
            schedule_lookup_result={
                "scheduledWorkouts": [
                    {
                        "workoutScheduleId": "67890",
                        "workoutId": "99999",
                    }
                ]
            }
        )
        auth_service = FakeAuthService(session=session)

        data = delete_data(auth_service)

        self.assertFalse(data["ok"])
        self.assertEqual(data["status"], "SCHEDULE_NOT_FOUND")
        self.assertEqual(session.schedule_lookup_count, 1)
        self.assertEqual(session.unschedule_count, 0)

    def test_delete_endpoint_delegates_to_garmin_client(self):
        request = GarminWorkoutDeleteRequest.model_validate(sample_delete_payload())
        with patch("app.main.GarminClient") as garmin_client_class:
            garmin_client_class.return_value.delete_workout.return_value = (
                GarminClient(
                    auth_service=FakeAuthService(session=FakeGarminSession())
                )
                .delete_workout(request)
            )

            response = delete_workout(request)

        data = response.model_dump(mode="json")

        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "DELETED")
        garmin_client_class.return_value.delete_workout.assert_called_once_with(
            request
        )

    def test_delete_response_does_not_expose_secret_fields(self):
        session = FakeGarminSession()
        auth_service = FakeAuthService(session=session)

        data = delete_data(auth_service)
        raw_response = json.dumps(data).lower()

        for forbidden in [
            "garmin_tokens",
            "cookie",
            "password",
            "authorization",
            "x-garmin-bridge-key",
            "access_token",
            "refresh_token",
            "raw response",
        ]:
            self.assertNotIn(forbidden, raw_response)


if __name__ == "__main__":
    unittest.main()
