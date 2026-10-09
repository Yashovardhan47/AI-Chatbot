from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import json
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.services.memory_service import recall, prompt_context, receipt_references
from app.core.config import settings

router = APIRouter(prefix="/api/agents", tags=["agents"])


def get_client():
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not set")
    import anthropic
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


class AgentRequest(BaseModel):
    query: str
    model: str = "claude-sonnet-4-6"


class DebateRequest(BaseModel):
    topic: str
    model: str = "claude-sonnet-4-6"


class PlanRequest(BaseModel):
    goal: str
    weeks: int = 4
    model: str = "claude-sonnet-4-6"


def call_claude(client, prompt, system, model):
    msg = client.messages.create(model=model, max_tokens=2048, system=system, messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text


@router.post("/multi-agent")
async def multi_agent(body: AgentRequest, user: User = Depends(get_current_user)):
    client = get_client()
    memory_result = await recall(str(user.id), body.query) if user.preferences.memory_enabled else {"used": [], "context": "[]"}
    mem_ctx = prompt_context(memory_result)

    try:
        intent_raw = call_claude(client, body.query, 'Return JSON only: {"specialist":"Research|Coding|Medical|Math|Legal|Finance|General"}', body.model)
        specialist = json.loads(intent_raw).get("specialist", "General")
    except Exception:
        specialist = "General"

    prompts = {
        "Research": "You are a Research Agent. Provide thorough, evidence-based answers.",
        "Coding":   "You are a Coding Agent. Provide working code and explain choices.",
        "Medical":  "You are a Medical Information Agent. Be accurate, recommend professional consultation.",
        "Math":     "You are a Math Agent. Show step-by-step working.",
        "Legal":    "You are a Legal Information Agent. Be precise, recommend professional advice.",
        "Finance":  "You are a Finance Agent. Be data-driven, mention risks.",
        "General":  "You are a knowledgeable assistant.",
    }
    sys = f"{prompts.get(specialist, prompts['General'])}\n\nUser context:\n{mem_ctx}"
    draft = call_claude(client, body.query, sys, body.model)

    try:
        reflect = call_claude(client, f"Query: {body.query}\nDraft: {draft}",
            'Review critically. Return JSON: {"improved_answer":"...","confidence":85}', body.model)
        rd = json.loads(reflect)
        final = rd.get("improved_answer", draft)
        conf  = rd.get("confidence", 85)
    except Exception:
        final, conf = draft, 85

    return {"specialist_used": specialist, "answer": final, "confidence": conf,
            "memory_context": len(memory_result["used"]), "memory_receipt": receipt_references(memory_result)}


@router.post("/debate")
async def debate(body: DebateRequest, user: User = Depends(get_current_user)):
    client = get_client()
    research = call_claude(client, f"Key facts about: {body.topic}", "You are a neutral Research Agent.", body.model)
    supporter = call_claude(client, f"Argue FOR: {body.topic}\nContext: {research}", "You are a Supporter Agent.", body.model)
    critic = call_claude(client, f"Argue AGAINST: {body.topic}\nContext: {research}", "You are a Critic Agent.", body.model)
    verdict = call_claude(client, f"Topic: {body.topic}\nFor: {supporter}\nAgainst: {critic}", "You are a Judge Agent. Give a balanced verdict.", body.model)
    return {"topic": body.topic, "research": research, "for": supporter, "against": critic, "verdict": verdict}


@router.post("/plan")
async def plan_task(body: PlanRequest, user: User = Depends(get_current_user)):
    client = get_client()
    sys = f'You are a Task Planner. Return JSON: {{"goal":"...","weeks":[{{"week":1,"theme":"...","tasks":["t1","t2"],"milestone":"..."}}]}}. Create {body.weeks} weeks.'
    try:
        result = call_claude(client, f"Plan for: {body.goal}", sys, body.model)
        plan = json.loads(result)
    except Exception:
        plan = {"goal": body.goal, "weeks": []}
    return {"plan": plan}
