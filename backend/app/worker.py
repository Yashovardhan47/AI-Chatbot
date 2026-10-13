import asyncio
from app.db.database import connect_db, disconnect_db
from app.services.continuity_service import process_due_commitments, deliver_reminder_emails
from app.core.config import settings
from app.core.logger import logger


async def run():
    settings.validate_runtime(); await connect_db()
    try:
        while True:
            try:
                await process_due_commitments(); await deliver_reminder_emails()
            except Exception:
                logger.warning("Reminder cycle failed; retrying on the next cycle")
            await asyncio.sleep(max(5, min(60, settings.REMINDER_POLL_SECONDS)))
    finally:
        await disconnect_db()


if __name__ == "__main__":
    asyncio.run(run())
