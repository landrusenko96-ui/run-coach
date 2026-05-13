import importlib
from getpass import getpass
from pathlib import Path
from types import ModuleType
from typing import Optional

from app.models import GarminAuthStartResponse, GarminStatusResponse

BRIDGE_ROOT = Path(__file__).resolve().parents[1]
GARMINCONNECT_TOKEN_DIRECTORY = BRIDGE_ROOT / ".garminconnect"
GARMINCONNECT_TOKEN_FILE = GARMINCONNECT_TOKEN_DIRECTORY / "garmin_tokens.json"


class GarminAuthService:
    """Local-only Garmin auth service for the experimental bridge."""

    def __init__(self, token_file: Path = GARMINCONNECT_TOKEN_FILE) -> None:
        self.token_file = token_file

    def get_status(self) -> GarminStatusResponse:
        if not self.token_file.exists():
            return GarminStatusResponse(
                configured=False,
                authenticated=False,
                auth_state="not_authenticated",
                message="No local python-garminconnect session token file was found.",
            )

        garminconnect = self._load_garminconnect()
        if garminconnect is None:
            return GarminStatusResponse(
                configured=True,
                authenticated=False,
                auth_state="auth_failed",
                message=(
                    "Local Garmin tokens exist, but python-garminconnect is not installed. "
                    "Install bridge requirements with Python 3.12 or newer."
                ),
            )

        try:
            self.resume_client()
        except Exception:
            return GarminStatusResponse(
                configured=True,
                authenticated=False,
                auth_state="auth_failed",
                message=(
                    "Local Garmin tokens were found, but the session could not be resumed. "
                    "Re-authentication may be needed."
                ),
            )

        return GarminStatusResponse(
            configured=True,
            authenticated=True,
            auth_state="authenticated",
            message="A local python-garminconnect session is available.",
        )

    def start_auth(self) -> GarminAuthStartResponse:
        garminconnect = self._load_garminconnect()
        if garminconnect is None:
            return GarminAuthStartResponse(
                ok=False,
                auth_state="auth_failed",
                message="Garmin authentication cannot start because python-garminconnect is not installed.",
                next_step="Install bridge requirements with Python 3.12 or newer, then restart the bridge.",
            )

        self.token_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.token_file.parent.chmod(0o700)

        print("")
        print("Garmin login requested by the local bridge.")
        print("Enter credentials only in this terminal. They are not stored by the bridge.")

        try:
            email = input("Garmin email: ").strip()
            if not email:
                return GarminAuthStartResponse(
                    ok=False,
                    auth_state="not_authenticated",
                    message="Garmin authentication was cancelled because no email was entered.",
                    next_step="Call /garmin/auth/start again when you are ready to log in.",
                )

            password = getpass("Garmin password: ")
            if not password:
                return GarminAuthStartResponse(
                    ok=False,
                    auth_state="not_authenticated",
                    message="Garmin authentication was cancelled because no password was entered.",
                    next_step="Call /garmin/auth/start again when you are ready to log in.",
                )

            client = garminconnect.Garmin(
                email,
                password,
                prompt_mfa=self._prompt_mfa,
                retry_attempts=0,
            )
            client.login(str(self.token_file))
            self.token_file.chmod(0o600)
        except EOFError:
            return GarminAuthStartResponse(
                ok=False,
                auth_state="not_authenticated",
                message="Garmin authentication was cancelled before login completed.",
                next_step="Run the bridge in an interactive terminal and call /garmin/auth/start again.",
            )
        except Exception as error:
            return GarminAuthStartResponse(
                ok=False,
                auth_state="auth_failed",
                message=(
                    "Garmin authentication did not complete. No password was stored. "
                    f"Safe error category: {self.safe_error_category(error)}."
                ),
                next_step="Avoid repeated retries. Check Garmin login and try again later if appropriate.",
            )

        return GarminAuthStartResponse(
            ok=True,
            auth_state="authenticated",
            message="Garmin authentication completed and local session tokens were saved.",
            next_step="Call /garmin/status to verify that the saved local session can be resumed.",
        )

    def resume_client(self):
        garminconnect = self._load_garminconnect()
        if garminconnect is None:
            raise RuntimeError("python-garminconnect is not installed.")

        client = garminconnect.Garmin(retry_attempts=0)
        client.login(str(self.token_file))
        return client

    def safe_error_category(self, error: Exception) -> str:
        error_name = type(error).__name__
        status_code = self._http_status_code(error)

        if error_name == "GarminConnectTooManyRequestsError":
            return "TOO_MANY_REQUESTS"

        if error_name == "GarminConnectAuthenticationError":
            return self._with_status("AUTHENTICATION_FAILED", status_code)

        if error_name == "GarminConnectConnectionError":
            return self._with_status("CONNECTION_ERROR", status_code)

        if error_name == "FileNotFoundError":
            return "NO_SAVED_SESSION"

        return self._with_status(f"UNEXPECTED_{error_name}", status_code)

    def _load_garminconnect(self) -> Optional[ModuleType]:
        try:
            return importlib.import_module("garminconnect")
        except ModuleNotFoundError:
            return None

    def _prompt_mfa(self) -> str:
        return input("Garmin MFA code: ").strip()

    def _http_status_code(self, error: Exception) -> Optional[int]:
        current: BaseException | None = error
        while current is not None:
            response = getattr(current, "response", None)
            status_code = getattr(response, "status_code", None)
            if isinstance(status_code, int):
                return status_code

            current = current.__cause__ or current.__context__

        return None

    def _with_status(self, category: str, status_code: Optional[int]) -> str:
        if status_code is None:
            return category

        return f"{category}_HTTP_{status_code}"
