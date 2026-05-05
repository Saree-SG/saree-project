import asyncio
import logging

from fastapi import FastAPI, Request
from zalo_bot import Bot, Update
from zalo_bot.constants import ChatAction
from zalo_bot.ext import CallbackContext, CommandHandler, Dispatcher, MessageHandler, filters

logger = logging.getLogger(__name__)

TOKEN = '1922487912217651490:tHEDJcBHwwRqonndrpxabPVeRPuFOCcXvCFWRkYQabddJMzsTyVLElSbADwSmhLQ'
bot = Bot(token=TOKEN)
app = FastAPI()
dispatcher = Dispatcher(bot, None, workers=0)


def configure_logging() -> None:
    """Attach a DEBUG console handler to this module's logger so logs show under uvicorn too."""
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"),
    )
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False


def user_log_label(user) -> str:
    """Build a short label (name + id) for log lines from a Zalo user object."""
    if user is None:
        return "<unknown user>"
    uid = getattr(user, "id", None)
    display = getattr(user, "display_name", None) or ""
    first = getattr(user, "first_name", None) or ""
    last = getattr(user, "last_name", None) or ""
    parts = [p for p in (display, first, last) if p]
    name = " ".join(parts).strip() or "<no name>"
    if uid is not None:
        return f"{name} (id={uid})"
    return name


@app.on_event("startup")
async def setup_webhook():
    """Register the public HTTPS webhook URL with Zalo when the app starts."""
    configure_logging()
    webhook_url = "https://0d31-203-205-27-251.ngrok-free.app/webhook"
    logger.info("Registering webhook url=%s", webhook_url)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: bot.set_webhook(url=webhook_url, secret_token="ZTEGC8941D33"))


async def start(update: Update, context: CallbackContext):
    """Handle the /start command with a short greeting."""
    user = update.effective_user
    logger.info("/start from user=%s chat_id=%s", user_log_label(user), update.message.chat.id)
    name = getattr(user, "first_name", None) or getattr(user, "display_name", "bạn")
    await update.message.reply_text(f"Xin chào {name}!")


async def echo(update: Update, context: CallbackContext):
    """Handle plain text: show typing, then echo the user message (simple Q&A style)."""
    user = update.effective_user
    user_text = update.message.text or ""
    logger.info(
        "Text message from user=%s chat_id=%s",
        user_log_label(user),
        update.message.chat.id,
    )
    logger.debug("User text (truncated): %s", user_text[:500])
    await context.bot.send_chat_action(
        chat_id=update.message.chat.id,
        action=ChatAction.TYPING,
    )
    await update.message.reply_text(f"Bạn vừa nói: {user_text}")


dispatcher.add_handler(CommandHandler("start", start))
dispatcher.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))


@app.post("/webhook")
async def webhook(request: Request):
    """Accept POST updates from Zalo and run them through the dispatcher."""
    payload = await request.json()
    data = payload.get("result", payload)
    logger.debug(
        "Webhook raw keys=%s",
        list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__,
    )
    update = Update.de_json(data, bot)
    if update and update.message:
        logger.info(
            "Webhook parsed user=%s chat_id=%s message_type=%s",
            user_log_label(update.effective_user),
            update.message.chat.id,
            getattr(update.message, "message_type", None),
        )
        logger.debug(
            "Webhook message text (truncated): %s",
            (update.message.text or "")[:500],
        )
    else:
        logger.debug("Webhook update without message: update=%r", update)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: dispatcher.process_update(update))
    return "ok"


if __name__ == "__main__":
    import uvicorn

    configure_logging()
    uvicorn.run(app, host="0.0.0.0", port=8443)
