"""Configuration gate: python -m app.preflight (does not send email or call AI)."""
import json
from app.core.config import settings


def production_issues(config):
    issues = []
    try:
        config.validate_runtime()
    except ValueError as error:
        issues.append(str(error))
    if config.DEBUG:
        issues.append("Set DEBUG=false for production; development may auto-verify email")
    if len(config.SECRET_KEY) < 32 or config.SECRET_KEY.startswith("neurofusion_dev"):
        issues.append("Generate a private SECRET_KEY of at least 32 characters")
    if not config.FRONTEND_URL.startswith("https://"):
        issues.append("Set FRONTEND_URL to the exact HTTPS frontend origin")
    if not config.GOOGLE_CLIENT_ID.endswith(".apps.googleusercontent.com"):
        issues.append("Configure your Google OAuth web client ID and its authorized frontend origin")
    if not all((config.MAIL_USERNAME, config.MAIL_PASSWORD, config.MAIL_SERVER)):
        issues.append("Configure SMTP for registration verification and password recovery")
    if config.MAIL_STARTTLS == config.MAIL_SSL_TLS:
        issues.append("Enable exactly one SMTP transport: STARTTLS or implicit TLS")
    if config.AI_PROVIDER == "anthropic" or config.AI_PROVIDER == "auto":
        key = config.ANTHROPIC_API_KEY.strip()
        if (config.AI_PROVIDER == "anthropic" and not key) or (key and "your" in key.lower()):
            issues.append("Configure a valid Anthropic API key or choose Ollama explicitly")
        if config.AI_PROVIDER == "auto" and not key:
            issues.append("Select an explicit production AI_PROVIDER and verify the model service")
    if config.AI_PROVIDER == "ollama" and not config.OLLAMA_URL:
        issues.append("Configure OLLAMA_URL and pull the selected chat model")
    return list(dict.fromkeys(issues))


def main():
    issues = production_issues(settings)
    print(json.dumps({"configuration_ready": not issues, "issues": issues,
        "remaining_checks": ["Database readiness at /api/ready", "Google consent on the final HTTPS origin",
            "SMTP delivery and password recovery", "Actual AI response and reminder worker",
            "Backups, restore drill and monitoring"]}, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
