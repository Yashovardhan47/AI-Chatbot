from app.core.config import settings
from app.core.logger import logger
from html import escape


async def send_verification_email(email: str, name: str, token: str):
    link = f"{settings.FRONTEND_URL}/verify-email/{token}"
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        if not settings.DEBUG:
            logger.warning("Verification email unavailable: configure SMTP")
            return
        logger.warning("=" * 60)
        logger.warning("EMAIL NOT CONFIGURED (fine for development)")
        logger.warning(f"Verify {email} with this link:")
        logger.warning(link)
        logger.warning("=" * 60)
        return
    try:
        from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
        conf = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME, MAIL_PASSWORD=settings.MAIL_PASSWORD,
            MAIL_FROM=settings.MAIL_FROM or settings.MAIL_USERNAME, MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER, MAIL_STARTTLS=settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=settings.MAIL_SSL_TLS, USE_CREDENTIALS=True,
        )
        html = f'<h2>Welcome, {escape(name)}!</h2><a href="{escape(link)}">Verify Email</a>'
        msg = MessageSchema(subject="Verify your NeuroFusion AI account", recipients=[email], body=html, subtype=MessageType.html)
        await FastMail(conf).send_message(msg)
    except Exception:
        logger.warning("Verification email delivery failed")
        if settings.DEBUG:
            logger.warning(link)


async def send_reset_email(email: str, name: str, token: str):
    link = f"{settings.FRONTEND_URL}/reset-password/{token}"
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        if not settings.DEBUG:
            logger.warning("Password reset email unavailable: configure SMTP")
            return
        logger.warning("=" * 60)
        logger.warning(f"PASSWORD RESET LINK for {email}:")
        logger.warning(link)
        logger.warning("=" * 60)
        return
    try:
        from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
        conf = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME, MAIL_PASSWORD=settings.MAIL_PASSWORD,
            MAIL_FROM=settings.MAIL_FROM or settings.MAIL_USERNAME, MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER, MAIL_STARTTLS=settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=settings.MAIL_SSL_TLS, USE_CREDENTIALS=True,
        )
        html = f'<h2>Reset password, {escape(name)}</h2><a href="{escape(link)}">Reset</a>'
        msg = MessageSchema(subject="Reset your NeuroFusion AI password", recipients=[email], body=html, subtype=MessageType.html)
        await FastMail(conf).send_message(msg)
    except Exception:
        logger.warning("Password reset email delivery failed")
        if settings.DEBUG:
            logger.warning(link)


async def send_reminder_email(email, title, message):
    from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
    conf = ConnectionConfig(MAIL_USERNAME=settings.MAIL_USERNAME, MAIL_PASSWORD=settings.MAIL_PASSWORD, MAIL_FROM=settings.MAIL_FROM or settings.MAIL_USERNAME,
        MAIL_PORT=settings.MAIL_PORT, MAIL_SERVER=settings.MAIL_SERVER, MAIL_STARTTLS=settings.MAIL_STARTTLS, MAIL_SSL_TLS=settings.MAIL_SSL_TLS, USE_CREDENTIALS=True)
    body = f'<h2>{escape(title)}</h2><p>{escape(message)}</p><a href="{escape(settings.FRONTEND_URL)}/continuity">Open NeuroSense</a>'
    await FastMail(conf).send_message(MessageSchema(subject="NeuroSense reminder", recipients=[email], body=body, subtype=MessageType.html))
