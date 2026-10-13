import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.services.memory_service import prompt_context, receipt_references
from app.services.workspace_context import gather_context
from app.services.ai_service import complete_ai, provider_status
from app.core.config import settings

router = APIRouter(prefix="/api/agents", tags=["AI workflows"])


class AgentRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    model: str = "claude-sonnet-4-6"


class DebateRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=2000)
    model: str = "claude-sonnet-4-6"


class PlanRequest(BaseModel):
    goal: str = Field(min_length=2, max_length=2000)
    weeks: int = Field(default=4, ge=1, le=26)
    model: str = "claude-sonnet-4-6"


class PlanWeek(BaseModel):
    week: int = Field(ge=1, le=26)
    theme: str
    tasks: list[str] = Field(min_length=1, max_length=10)
    milestone: str = ""


class Plan(BaseModel):
    goal: str
    weeks: list[PlanWeek] = Field(min_length=1, max_length=26)


async def ask(prompt, system, model):
    try:
        return await complete_ai(prompt, system, model)
    except Exception:
        raise HTTPException(503, "AI provider unavailable. Configure Anthropic or a running local Ollama model.")


@router.get("/capabilities")
async def capabilities(user: User = Depends(get_current_user)):
    return {**provider_status(), "web_search": bool(settings.ANTHROPIC_API_KEY), "remote_image_analysis": bool(settings.ANTHROPIC_API_KEY)}


@router.post("/multi-agent")
async def multi_agent(body: AgentRequest, user: User = Depends(get_current_user)):
    memory = await gather_context(user, body.query) if user.preferences.memory_enabled else {"used": [], "context": "[]"}
    specialists = {"Research", "Coding", "Math", "General"}
    try:
        intent = json.loads(await ask(body.query, 'Classify this request. Return only JSON: {"specialist":"Research|Coding|Math|General"}', body.model))
        specialist = intent.get("specialist", "General")
    except (ValueError, TypeError):
        specialist = "General"
    if specialist not in specialists:
        specialist = "General"
    system = f"You are a {specialist} assistant. Give a precise useful answer. State uncertainty. " + prompt_context(memory)
    draft = await ask(body.query, system, body.model)
    final = draft; confidence = None
    try:
        reviewed = json.loads(await ask(f"Question: {body.query}\nDraft: {draft}",
            'Critically review the draft; do not invent evidence. Return JSON {"improved_answer":"...","confidence":80}. Confidence is self-assessed, not measured accuracy.', body.model))
        if isinstance(reviewed.get("improved_answer"), str):
            final = reviewed["improved_answer"]
        if isinstance(reviewed.get("confidence"), (int, float)):
            confidence = max(0, min(100, reviewed["confidence"]))
    except (ValueError, TypeError):
        pass
    return {"specialist_used": specialist, "answer": final, "confidence": confidence,
            "memory_context": len(memory["used"]), "memory_receipt": receipt_references(memory)}


@router.post("/debate")
async def debate(body: DebateRequest, user: User = Depends(get_current_user)):
    research = await ask(body.topic, "Describe established facts and uncertainties without fabricating sources.", body.model)
    supporter = await ask(f"Argue FOR: {body.topic}\nContext: {research}", "Develop the strongest supported argument.", body.model)
    critic = await ask(f"Argue AGAINST: {body.topic}\nContext: {research}", "Develop a critical supported argument.", body.model)
    verdict = await ask(f"Topic: {body.topic}\nFor: {supporter}\nAgainst: {critic}", "Give a balanced verdict; separate evidence from speculation.", body.model)
    return {"topic": body.topic, "research": research, "for": supporter, "against": critic, "verdict": verdict}


@router.post("/plan")
async def plan_task(body: PlanRequest, user: User = Depends(get_current_user)):
    raw = await ask(body.goal, 'Create a realistic plan. Return JSON only with goal and weeks, each week containing week, theme, tasks (array of strings), milestone. '
                    f'Include exactly {body.weeks} weeks. Do not create reminders or claim tasks are already scheduled.', body.model)
    try:
        plan = Plan.model_validate_json(raw)
        if len(plan.weeks) != body.weeks:
            raise ValueError()
    except ValueError:
        raise HTTPException(502, "The model did not return a valid complete plan; try a more specific goal")
    return {"plan": plan.model_dump()}
