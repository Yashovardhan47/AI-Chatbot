import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ get: vi.fn(), memories: vi.fn(), changes: vi.fn(), impact: vi.fn(), preview: vi.fn(), commit: vi.fn(), replay: vi.fn(), apply: vi.fn(), audit: vi.fn(), clarify: vi.fn() }));
vi.mock("../services/api", () => ({ default: { get: mocks.get }, memoryAPI: { getAll: mocks.memories }, contextAPI: mocks }));
import ContextLabPage from "./ContextLabPage";
const sourceId = "a".repeat(24);
const impact = { items: [{ kind: "answer", id: "chat:answer", title: "Architecture", excerpt: "Use Flask", classification: "possible", href: "/chat/chat", claims: [] }], counts: { possible: 1 }, total: 1, has_more: false, scan_complete: true, context_revision: 5 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: { projects: [{ id: "project", name: "Research" }] } });
  mocks.memories.mockResolvedValue({ data: { memories: [{ id: sourceId, fact: "We use Flask", version: 1 }], total: 1 } });
  mocks.changes.mockResolvedValue({ data: { changes: [], total: 0 } });
  mocks.preview.mockResolvedValue({ data: { ...impact, preview_token: "signed-preview", proposed_fact: "We use FastAPI" } });
  mocks.commit.mockResolvedValue({ data: { memory: { id: sourceId, fact: "We use FastAPI", version: 2 }, change_id: "change" } });
  mocks.impact.mockResolvedValue({ data: impact });
  mocks.replay.mockResolvedValue({ data: { id: "replay", target_kind: "answer", evidence: [{ id: sourceId, fact: "We use FastAPI", version: 2 }], expires_at: "2026-12-01T12:00:00", proposal: "Add a separate evidence note." } });
  mocks.apply.mockResolvedValue({ data: { status: "applied" } });
});
afterEach(cleanup);
function open(path = `/context-lab?memory=${sourceId}`) { return render(<MemoryRouter initialEntries={[path]}><ContextLabPage /></MemoryRouter>); }

it("requires preview, commits its exact receipt, then separately approves an evidence review", async () => {
  open(); await screen.findByRole("option", { name: /We use Flask/ });
  await userEvent.type(screen.getByLabelText("Corrected fact"), "We use FastAPI");
  await userEvent.click(screen.getByRole("button", { name: /Preview recorded impact/ }));
  await screen.findByText("Preview this correction.");
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.preview).toHaveBeenCalledWith({ memory_id: sourceId, expected_version: 1, action: "correct", fact: "We use FastAPI" });
  await userEvent.click(screen.getByRole("button", { name: "Apply this correction" }));
  await screen.findByText("Choose what needs a closer look.");
  expect(mocks.commit).toHaveBeenCalledWith({ memory_id: sourceId, expected_version: 1, action: "correct", fact: "We use FastAPI", expected_context_revision: 5, preview_token: "signed-preview" });
  await userEvent.click(screen.getByRole("button", { name: "Replay current evidence" }));
  await screen.findByRole("button", { name: "Approve evidence note" });
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.replay).toHaveBeenCalledWith({ change_id: "change", target_kind: "answer", target_id: "chat:answer" });
  await userEvent.click(screen.getByRole("button", { name: "Approve evidence note" }));
  await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith("replay", {}));
});

it("invalidates the preview immediately when the proposed fact changes", async () => {
  open(); await screen.findByRole("option", { name: /We use Flask/ });
  await userEvent.type(screen.getByLabelText("Corrected fact"), "We use FastAPI");
  await userEvent.click(screen.getByRole("button", { name: /Preview recorded impact/ }));
  await screen.findByText("Preview this correction.");
  await userEvent.type(screen.getByLabelText("Corrected fact"), " now");
  expect(screen.queryByRole("button", { name: "Apply this correction" })).toBeNull();
  expect(mocks.commit).not.toHaveBeenCalled();
});

it("clears a stale replay and shows the server conflict instead of reporting success", async () => {
  mocks.apply.mockRejectedValue({ response: { status: 409, data: { detail: "Evidence was revoked. Replay again." } } });
  open("/context-lab?change=change"); await screen.findByRole("button", { name: "Replay current evidence" });
  await userEvent.click(screen.getByRole("button", { name: "Replay current evidence" }));
  await screen.findByRole("button", { name: "Approve evidence note" });
  await userEvent.click(screen.getByRole("button", { name: "Approve evidence note" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Evidence was revoked");
  expect(screen.queryByRole("button", { name: "Approve evidence note" })).toBeNull();
});

it("audits the selected scope and budget while explaining redacted exclusions", async () => {
  mocks.audit.mockResolvedValue({ data: { counts: { included: 1, outside_scope: 2, expired: 1 }, decisions: [{ id: sourceId, version: 1, fact: "We use Flask", decision: "included" }], context_chars: 150, budget: 200, retrieval_mode: "lexical" } });
  open("/context-lab?tab=audit"); await screen.findByRole("option", { name: "Research + personal" });
  await userEvent.type(screen.getByLabelText("Recall question"), "Which backend?");
  await userEvent.selectOptions(screen.getByLabelText("Context scope"), "project");
  await userEvent.clear(screen.getByLabelText(/Context budget/)); await userEvent.type(screen.getByLabelText(/Context budget/), "200");
  await userEvent.click(screen.getByRole("button", { name: "Inspect recall" }));
  await screen.findByText("150 / 200 characters · lexical retrieval");
  expect(mocks.audit).toHaveBeenCalledWith({ query: "Which backend?", project_id: "project", budget: 200 });
  expect(screen.getByText("Outside this scope")).toBeTruthy();
});

it("passes an explicit one-turn clarification choice without editing memories", async () => {
  mocks.clarify.mockResolvedValueOnce({ data: { needs_clarification: true, question: "Which remembered context should guide this decision?", reason: "Explicit contradiction", alternatives: [{ id: sourceId, fact: "Use Flask", version: 1, scope: "Personal" }] } }).mockResolvedValueOnce({ data: { needs_clarification: false } });
  open("/context-lab?tab=clarify"); await screen.findByRole("option", { name: "Research + personal" });
  await userEvent.type(screen.getByLabelText("Decision question"), "Which backend should I use?");
  await userEvent.click(screen.getByRole("button", { name: "Check decision context" }));
  await screen.findByText("Explicit contradiction");
  await userEvent.click(screen.getByRole("button", { name: /Use Flask/ }));
  await screen.findByText("Your context choice is clear.");
  expect(mocks.clarify).toHaveBeenLastCalledWith({ query: "Which backend should I use?", project_id: null, choices: [{ id: sourceId, version: 1 }] });
  expect(mocks.commit).not.toHaveBeenCalled();
});

it("supports arrow-key navigation between the context tools", async () => {
  open(); await screen.findByRole("option", { name: /We use Flask/ });
  screen.getByRole("tab", { name: "Impact replay" }).focus();
  await userEvent.keyboard("{ArrowRight}");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Recall decisions" })));
  expect(screen.getByRole("tabpanel", { name: "Recall decisions" })).toBeTruthy();
});
