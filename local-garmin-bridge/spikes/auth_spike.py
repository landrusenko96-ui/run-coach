import argparse
import json
from getpass import getpass
from importlib import metadata
from pathlib import Path
from typing import Any, Dict


SPIKE_ROOT = Path(__file__).resolve().parents[1]
TOKEN_DIRECTORY = SPIKE_ROOT / ".garminconnect-spike"
TOKEN_FILE = TOKEN_DIRECTORY / "garmin_tokens.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safely test python-garminconnect login/session creation."
    )
    parser.add_argument(
        "command",
        choices=["status", "login"],
        help="Use 'status' to check saved tokens or 'login' to attempt one login.",
    )
    args = parser.parse_args()

    if args.command == "status":
        result = check_status()
    else:
        result = login_once()

    print(json.dumps(result, indent=2, sort_keys=True))


def check_status() -> Dict[str, Any]:
    garminconnect = load_garminconnect()
    if garminconnect is None:
        return result(
            ok=False,
            category="DEPENDENCY_MISSING",
            authenticated=False,
            detail="Install garminconnect and curl_cffi in the local bridge virtual environment.",
        )

    if not TOKEN_FILE.exists():
        return result(
            ok=True,
            category="NO_SAVED_SESSION",
            authenticated=False,
            detail="No local spike token file exists.",
        )

    try:
        client = garminconnect.Garmin(retry_attempts=0)
        client.login(str(TOKEN_FILE))
        return result(
            ok=True,
            category="AUTHENTICATED",
            authenticated=True,
            detail="Saved spike session loaded successfully.",
        )
    except Exception as error:
        return safe_error_result(error, authenticated=False)


def login_once() -> Dict[str, Any]:
    garminconnect = load_garminconnect()
    if garminconnect is None:
        return result(
            ok=False,
            category="DEPENDENCY_MISSING",
            authenticated=False,
            detail="Install garminconnect and curl_cffi in the local bridge virtual environment.",
        )

    TOKEN_DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    TOKEN_DIRECTORY.chmod(0o700)

    print("Garmin Connect auth spike")
    print("Credentials are read from this terminal only and are not written to code.")
    print("This script makes one login call. Do not rerun repeatedly if Garmin rejects it.")

    email = input("Garmin email: ").strip()
    if not email:
        return result(
            ok=False,
            category="CANCELLED",
            authenticated=False,
            detail="No email entered.",
        )

    password = getpass("Garmin password: ")
    if not password:
        return result(
            ok=False,
            category="CANCELLED",
            authenticated=False,
            detail="No password entered.",
        )

    try:
        client = garminconnect.Garmin(
            email,
            password,
            prompt_mfa=prompt_mfa,
            retry_attempts=0,
        )
        client.login(str(TOKEN_FILE))
        TOKEN_FILE.chmod(0o600)
        return result(
            ok=True,
            category="AUTHENTICATED",
            authenticated=True,
            detail="Login succeeded and spike token file was saved locally.",
        )
    except Exception as error:
        return safe_error_result(error, authenticated=False)


def load_garminconnect():
    try:
        import garminconnect
    except ModuleNotFoundError:
        return None

    return garminconnect


def prompt_mfa() -> str:
    return input("Garmin MFA code: ").strip()


def result(
    *,
    ok: bool,
    category: str,
    authenticated: bool,
    detail: str,
) -> Dict[str, Any]:
    version = package_version("garminconnect")
    return {
        "ok": ok,
        "category": category,
        "authenticated": authenticated,
        "token_file_exists": TOKEN_FILE.exists(),
        "token_file": str(TOKEN_FILE),
        "garminconnect_version": version,
        "detail": detail,
    }


def safe_error_result(error: Exception, *, authenticated: bool) -> Dict[str, Any]:
    error_name = type(error).__name__
    category = safe_error_category(error_name)
    status_code = safe_http_status(error)

    detail = category
    if status_code is not None:
        detail = f"{category}: HTTP {status_code}"

    return result(
        ok=False,
        category=category,
        authenticated=authenticated,
        detail=detail,
    )


def safe_error_category(error_name: str) -> str:
    if error_name == "GarminConnectTooManyRequestsError":
        return "TOO_MANY_REQUESTS"

    if error_name == "GarminConnectAuthenticationError":
        return "AUTHENTICATION_FAILED"

    if error_name == "GarminConnectConnectionError":
        return "CONNECTION_ERROR"

    if error_name == "FileNotFoundError":
        return "NO_SAVED_SESSION"

    return f"UNEXPECTED_{error_name}"


def safe_http_status(error: Exception) -> int | None:
    current: BaseException | None = error
    while current is not None:
        response = getattr(current, "response", None)
        status_code = getattr(response, "status_code", None)
        if isinstance(status_code, int):
            return status_code

        current = current.__cause__

    return None


def package_version(package_name: str) -> str | None:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return None


if __name__ == "__main__":
    main()
