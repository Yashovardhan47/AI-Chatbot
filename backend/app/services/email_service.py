from app.core.config import settings
from app.core.logger import logger


async def send_verification_email(email: str, name: str, token: str):
    link = f"{settings.FRONTEND_URL}/verify-email/{token}"
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
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
        html = f'<h2>Welcome, {name}!</h2><a href="{link}">Verify Email</a>'
        msg = MessageSchema(subject="Verify your NeuroFusion AI account", recipients=[email], body=html, subtype=MessageType.html)
        await FastMail(conf).send_message(msg)
    except Exception as e:
        logger.warning(f"Email failed, link: {link} ({e})")


async def send_reset_email(email: str, name: str, token: str):
    link = f"{settings.FRONTEND_URL}/reset-password/{token}"
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
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
        html = f'<h2>Reset password, {name}</h2><a href="{link}">Reset</a>'
        msg = MessageSchema(subject="Reset your NeuroFusion AI password", recipients=[email], body=html, subtype=MessageType.html)
        await FastMail(conf).send_message(msg)
    except Exception as e:
        logger.warning(f"Email failed, link: {link} ({e})")
