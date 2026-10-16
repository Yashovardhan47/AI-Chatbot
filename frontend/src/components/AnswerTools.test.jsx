import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ answer: vi.fn(), support: vi.fn(), create: vi.fn() }));
vi.mock("../services/api", () => ({ contextAPI: { answer: mocks.answer, support: mocks.support }, continuityAPI: { create: mocks.create } }));
import AnswerTools from "./AnswerTools";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ data: {} }); mocks.support.mockResolvedValue({ data: {} });
  mocks.answer.mockResolvedValue({ data: { answer_fingerprint: "fingerprint", claims: [], available_evidence: [{ id: "first", fact: "Current backend: FastAPI", version: 2 }, { id: "second", fact: "Independent supporting source", version: 1 }] } });
});
afterEach(cleanup);
function open() { return render(<MemoryRouter><AnswerTools message={{ id: "answer" }} chatId="chat" projectId="project" /></MemoryRouter>); }

it("creates an explicitly written task linked to the exact answer and project", async () => {
  open(); await userEvent.click(screen.getByRole("button", { name: "Keep a next step" }));
  await userEvent.type(screen.getByLabelText("Commitment title"), "Evaluate the new backend");
  await userEvent.type(screen.getByLabelText("Notes"), "Compare the latency.");
  await userEvent.click(screen.getByRole("button", { name: "Save commitment" }));
  expect(mocks.create).toHaveBeenCalledWith({ title: "Evaluate the new backend", notes: "Compare the latency.", project_id: "project", source_chat_id: "chat", source_message_id: "answer", due_at: null });
});

it("records alternative support groups only after owner confirmation", async () => {
  open(); await userEvent.click(screen.getByRole("button", { name: "Track claim support" }));
  await screen.findByText("Current backend: FastAPI");
  await userEvent.type(screen.getByLabelText("Exact words from this answer"), "Use FastAPI.");
  await userEvent.click(within(screen.getByRole("group", { name: "Primary support group" })).getByRole("checkbox", { name: /Current backend/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Add an independent support group" }));
  await userEvent.click(within(screen.getByRole("group", { name: "Independent alternative support" })).getByRole("checkbox", { name: /Independent supporting/ }));
  expect(mocks.support).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirm this support" }));
  expect(mocks.support).toHaveBeenCalledWith({ chat_id: "chat", message_id: "answer", quote: "Use FastAPI.", answer_fingerprint: "fingerprint", expected_version: 0, support_sets: [[{ id: "first", version: 2 }], [{ id: "second", version: 1 }]] });
});

it("keeps textarea focus while typing and restores the trigger after Escape", async () => {
  open(); const trigger = screen.getByRole("button", { name: "Keep a next step" });
  await userEvent.click(trigger); const field = screen.getByLabelText("Notes");
  await userEvent.type(field, "A continuous draft");
  expect(field.value).toBe("A continuous draft"); expect(document.activeElement).toBe(field);
  await userEvent.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
});

it("shows a failed task write and preserves its draft for retry", async () => {
  mocks.create.mockRejectedValue({ response: { data: { detail: "Source evidence changed. Review first." } } });
  open(); await userEvent.click(screen.getByRole("button", { name: "Keep a next step" }));
  await userEvent.type(screen.getByLabelText("Commitment title"), "Keep this draft");
  await userEvent.click(screen.getByRole("button", { name: "Save commitment" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Source evidence changed");
  expect(screen.getByLabelText("Commitment title").value).toBe("Keep this draft");
});
