from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field, ValidationError
from beanie import PydanticObjectId
from bson.errors import InvalidId
from datetime import datetime, date
from typing import Optional, List

from app.middleware.auth_dep import get_current_user, ws_auth
from app.models.user    import User
from app.models.chat    import Chat, Message, Attachment
from app.services.ai_service import build_system_prompt, build_user_content, extract_metadata, stream_ai_response, ALLOWED_MODELS, DEFAULT_MODEL
from app.services.memory_service import capture_turn, recall, prompt_context, receipt_references
from app.api.routes.memory import owned_project
from app.core.logger import logger

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateChatBody(BaseModel):
    project_id:   Optional[str] = None
    mode:         str           = "auto"
    is_daily:     bool          = False
    session_date: Optional[str] = None


class TurnBody(BaseModel):
    content: str = Field(default="", max_length=20000)
    attachments: List[dict] = Field(default_factory=list, max_length=5)
    mode: str = "auto"
    web_search: bool = False
    model: str = DEFAULT_MODEL
    private: bool = False


async def owned_chat(chat_id: str, user_id: str) -> Chat:
    try:
        chat = await Chat.get(PydanticObjectId(chat_id))
    except (ValueError, InvalidId):
        chat = None
    if not chat or chat.user_id != user_id or not chat.is_active:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


class UpdateChatBody(BaseModel):
    title:   Optional[str]       = None
    pinned:  Optional[bool]      = None
    starred: Optional[bool]      = None
    tags:    Optional[List[str]] = None
    mode:    Optional[str]       = None


@router.get("/")
async def get_chats(current_user: User = Depends(get_current_user)):
    chats = await Chat.find(Chat.user_id == str(current_user.id), Chat.is_active == True).sort(-Chat.updated_at).limit(200).to_list()
    return {"chats": [
        {
            "id": str(c.id), "title": c.title, "mode": c.mode, "pinned": c.pinned,
            "starred": c.starred, "tags": c.tags, "project_id": c.project_id,
            "is_daily": c.is_daily, "session_date": c.session_date,
            "message_count": len(c.messages), "updated_at": c.updated_at, "created_at": c.created_at,
        } for c in chats
    ]}


@router.post("/daily")
async def get_or_create_daily(current_user: User = Depends(get_current_user)):
    today = date.today().isoformat()
    existing = await Chat.find_one(
        Chat.user_id == str(current_user.id), Chat.session_date == today,
        Chat.is_daily == True, Chat.is_active == True,
    )
    if existing:
        d = existing.model_dump(); d["id"] = str(existing.id)
        return {"chat": d, "is_new": False}

    day_name = datetime.now().strftime("%A, %B %d")
    chat = Chat(user_id=str(current_user.id), title=f"Today — {day_name}", is_daily=True, session_date=today, mode="auto")
    await chat.insert()
    d = chat.model_dump(); d["id"] = str(chat.id)
    return {"chat": d, "is_new": True}


@router.get("/history")
async def get_history(current_user: User = Depends(get_current_user)):
    chats = await Chat.find(Chat.user_id == str(current_user.id), Chat.is_active == True).sort(-Chat.updated_at).limit(200).to_list()
    from collections import defaultdict
    from datetime import timedelta

    today, yesterday = date.today(), date.today() - timedelta(days=1)
    groups = defaultdict(list)
    for c in chats:
        sd = c.session_date or c.created_at.date().isoformat()
        try: d = date.fromisoformat(sd)
        except Exception: d = c.created_at.date()

        if d == today: label = "Today"
        elif d == yesterday: label = "Yesterday"
        elif (today - d).days < 7: label = d.strftime("%A")
        elif (today - d).days < 30: label = "This month"
        else: label = d.strftime("%B %Y")

        groups[label].append({
            "id": str(c.id), "title": c.title, "mode": c.mode, "starred": c.starred,
            "pinned": c.pinned, "is_daily": c.is_daily, "session_date": sd,
            "message_count": len(c.messages), "updated_at": c.updated_at.isoformat(),
        })

    order = ["Today","Yesterday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","This month"]
    ordered = {k: groups[k] for k in order if k in groups}
    for k in groups:
        if k not in ordered: ordered[k] = groups[k]
    return {"groups": ordered}


@router.post("/", status_code=201)
async def create_chat(body: CreateChatBody, current_user: User = Depends(get_current_user)):
    await owned_project(body.project_id, str(current_user.id))
    today = date.today().isoformat()
    chat  = Chat(
        user_id=str(current_user.id), project_id=body.project_id, mode=body.mode,
        is_daily=body.is_daily, session_date=body.session_date or (today if body.is_daily else None),
    )
    await chat.insert()
    return {"chat": {
        "id": str(chat.id), "title": chat.title, "mode": chat.mode, "project_id": chat.project_id,
        "is_daily": chat.is_daily, "session_date": chat.session_date, "starred": chat.starred,
        "updated_at": chat.updated_at, "created_at": chat.created_at,
    }}


@router.get("/{chat_id}")
async def get_chat(chat_id: str, current_user: User = Depends(get_current_user)):
    chat = await owned_chat(chat_id, str(current_user.id))
    d = chat.model_dump(); d["id"] = str(chat.id)
    return {"chat": d}


@router.put("/{chat_id}")
async def update_chat(chat_id: str, body: UpdateChatBody, current_user: User = Depends(get_current_user)):
    chat = await owned_chat(chat_id, str(current_user.id))
    if body.title   is not None: chat.title   = body.title
    if body.pinned  is not None: chat.pinned  = body.pinned
    if body.starred is not None: chat.starred = body.starred
    if body.tags    is not None: chat.tags    = body.tags
    if body.mode    is not None: chat.mode    = body.mode
    chat.updated_at = datetime.utcnow()
    await chat.save()
    return {"chat": {"id": str(chat.id), "title": chat.title}}


@router.delete("/{chat_id}")
async def delete_chat(chat_id: str, current_user: User = Depends(get_current_user)):
    chat = await owned_chat(chat_id, str(current_user.id))
    chat.is_active = False
    await chat.save()
    return {"message": "Chat deleted"}


@router.websocket("/ws/{chat_id}")
async def chat_ws(websocket: WebSocket, chat_id: str, token: str = Query(...)):
    await websocket.accept()
    try:
        user = await ws_auth(websocket, token)
    except Exception:
        return

    if chat_id == "new":
        today = date.today().isoformat()
        chat  = Chat(user_id=str(user.id), session_date=today)
        await chat.insert()
        await websocket.send_json({"type": "chat_created", "chat_id": str(chat.id)})
    else:
        try:
            chat = await owned_chat(chat_id, str(user.id))
            await owned_project(chat.project_id, str(user.id))
        except HTTPException:
            await websocket.close(code=1008)
            return

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") != "message":
                continue

            try:
                turn = TurnBody.model_validate(data)
            except ValidationError:
                await websocket.send_json({"type": "error", "message": "Use up to 20,000 characters and 5 attachments"})
                continue
            content, attachments, mode, web_search = turn.content, turn.attachments, turn.mode, turn.web_search
            model = turn.model if turn.model in ALLOWED_MODELS else DEFAULT_MODEL
            if not content.strip() and not attachments:
                await websocket.send_json({"type": "error", "message": "Enter a message or attach a file"})
                continue
            # Revalidate active account, token and current privacy preferences
            # on every turn, including sockets opened before sign-out.
            user = await ws_auth(websocket, token)
            chat = await owned_chat(str(chat.id), str(user.id))
            await owned_project(chat.project_id, str(user.id))
            memory_enabled = user.preferences.memory_enabled and not turn.private
            # Cross-session knowledge comes only from the scoped memory layer;
            # raw recent chats must not bypass private mode or project boundaries.
            history = [{"role": m.role, "content": m.content} for m in chat.messages[-20:]]

            class AttObj:
                def __init__(self, d):
                    self.file_type    = d.get("file_type", "file")
                    self.url          = d.get("url", "")
                    self.name         = d.get("name", "")
                    self.text_content = d.get("text_content")

            att_objs     = [AttObj(a) for a in attachments]
            user_content = build_user_content(content, att_objs)

            user_msg = Message(role="user", content=content,
                attachments=[Attachment(name=a.name, url=a.url, file_type=a.file_type) for a in att_objs])
            changes = {"updated_at": datetime.utcnow()}
            if (chat.title == "New Conversation" or chat.title.startswith("Today —")) and content:
                changes["title"] = content[:55] + ("…" if len(content) > 55 else "")
            await Chat.get_motor_collection().update_one({"_id": chat.id, "user_id": str(user.id)},
                {"$push": {"messages": user_msg.model_dump()}, "$set": changes})

            saved_memories = []
            memory_result = {"used": [], "context": "[]", "candidates": 0, "context_chars": 2,
                             "algorithm": "bm25-trigram-temporal-v1", "disabled": not memory_enabled}
            memory_warning = None
            if memory_enabled:
                try:
                    saved_memories = await capture_turn(str(user.id), content, str(chat.id), user_msg.id,
                                                        chat.project_id, user.preferences.memory_auto_capture,
                                                        observed_at=user_msg.created_at)
                    refreshed_user = await User.get(user.id)
                    if refreshed_user and refreshed_user.is_active and refreshed_user.preferences.memory_enabled:
                        memory_result = await recall(str(user.id), content, chat.project_id)
                    else:
                        memory_result["disabled"] = True
                except Exception:
                    logger.warning("NeuroSense memory processing unavailable")
                    memory_warning = "Memory is temporarily unavailable for this turn"
            system_prompt = build_system_prompt(mode, prompt_context(memory_result))

            full_text = ""
            try:
                async for delta in stream_ai_response(user_content, history, system_prompt, web_search, model):
                    full_text += delta
                    await websocket.send_json({"type": "delta", "delta": delta})
            except Exception:
                logger.warning("AI generation unavailable")
                err = "The AI provider is unavailable. Your message was saved; please try again."
                await websocket.send_json({"type": "delta", "delta": err})
                full_text = err

            meta = extract_metadata(full_text)
            ai_msg = Message(role="assistant", content=meta["clean_text"], confidence=meta["confidence"],
                reasoning=meta["reasoning"], sources=meta["sources"],
                memory_receipt=receipt_references(memory_result))
            await Chat.get_motor_collection().update_one({"_id": chat.id, "user_id": str(user.id)},
                {"$push": {"messages": ai_msg.model_dump()}, "$set": {"updated_at": datetime.utcnow()}})

            try:
                user.stats.total_messages += 1
                await user.save()
            except Exception:
                pass

            await websocket.send_json({
                "type": "done", "chat_id": str(chat.id), "confidence": meta["confidence"],
                "reasoning": meta["reasoning"], "sources": meta["sources"], "model": model,
                "content": meta["clean_text"], "message_id": ai_msg.id,
                "saved_memories": saved_memories, "memory_receipt": receipt_references(memory_result),
                "memory_warning": memory_warning,
            })

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.send_json({"type": "error", "message": "Unable to process this conversation; please reload"})
        except Exception:
            pass
