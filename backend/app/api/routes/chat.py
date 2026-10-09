from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, List

from app.middleware.auth_dep import get_current_user, ws_auth
from app.models.user    import User
from app.models.chat    import Chat, Message, Attachment
from app.models.memory  import Memory
from app.services.ai_service import build_system_prompt, build_user_content, extract_metadata, stream_ai_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateChatBody(BaseModel):
    project_id:   Optional[str] = None
    mode:         str           = "auto"
    is_daily:     bool          = False
    session_date: Optional[str] = None


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
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
    d = chat.model_dump(); d["id"] = str(chat.id)
    return {"chat": d}


@router.put("/{chat_id}")
async def update_chat(chat_id: str, body: UpdateChatBody, current_user: User = Depends(get_current_user)):
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
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
    chat = await Chat.get(chat_id)
    if not chat or chat.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Chat not found")
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
        chat = await Chat.get(chat_id)
        if not chat or chat.user_id != str(user.id):
            await websocket.close(code=1008)
            return

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") != "message":
                continue

            content     = data.get("content", "")
            attachments = data.get("attachments", [])
            mode        = data.get("mode", "auto")
            web_search  = data.get("web_search", False)
            model       = data.get("model", "claude-sonnet-4-6")

            memories = await Memory.find(Memory.user_id == str(user.id), Memory.active == True).sort(-Memory.created_at).limit(50).to_list()
            system_prompt = build_system_prompt(mode, memories)

            recent_context = []
            if len(chat.messages) < 3:
                recent_chats = await Chat.find(Chat.user_id == str(user.id), Chat.is_active == True).sort(-Chat.updated_at).limit(3).to_list()
                for rc in recent_chats:
                    if str(rc.id) != str(chat.id) and rc.messages:
                        for m in rc.messages[-2:]:
                            recent_context.append({"role": m.role, "content": f"[Previous session] {m.content[:300]}"})

            history = recent_context + [{"role": m.role, "content": m.content} for m in chat.messages[-20:]]

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
            chat.messages.append(user_msg)
            if (chat.title == "New Conversation" or chat.title.startswith("Today —")) and content:
                chat.title = content[:55] + ("…" if len(content) > 55 else "")

            full_text = ""
            try:
                async for delta in stream_ai_response(user_content, history, system_prompt, web_search, model):
                    full_text += delta
                    await websocket.send_json({"type": "delta", "delta": delta})
            except Exception as e:
                err = f"AI Error: {str(e)}"
                await websocket.send_json({"type": "delta", "delta": err})
                full_text = err

            meta = extract_metadata(full_text)
            ai_msg = Message(role="assistant", content=meta["clean_text"], confidence=meta["confidence"],
                reasoning=meta["reasoning"], sources=meta["sources"], memory_note=meta["memory"])
            chat.messages.append(ai_msg)
            chat.updated_at = datetime.utcnow()
            await chat.save()

            new_memory = None
            if meta["memory"]:
                exists = await Memory.find_one(Memory.user_id == str(user.id), Memory.fact == meta["memory"], Memory.active == True)
                if not exists:
                    mem = Memory(user_id=str(user.id), fact=meta["memory"], source_chat_id=str(chat.id))
                    await mem.insert()
                    new_memory = meta["memory"]

            try:
                user.stats.total_messages += 1
                await user.save()
            except Exception:
                pass

            await websocket.send_json({
                "type": "done", "chat_id": str(chat.id), "confidence": meta["confidence"],
                "reasoning": meta["reasoning"], "sources": meta["sources"], "memory": new_memory, "model": model,
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
