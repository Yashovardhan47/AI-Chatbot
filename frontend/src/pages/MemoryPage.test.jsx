import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  memory: { getAll: vi.fn(), stats: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    clearAll: vi.fn(), recall: vi.fn(), getOne: vi.fn() },
  userAPI: { updatePrefs: vi.fn() }, projectGet: vi.fn(), updateUser: vi.fn(), fetchMemories: vi.fn(),
  user: { preferences: { memory_enabled: true, memory_auto_capture: true } },
}));
vi.mock("../services/api", () => ({ default: { get: mocks.projectGet }, memoryAPI: mocks.memory, userAPI: mocks.userAPI }));
vi.mock("../context/authStore", () => ({ default: () => ({ user: mocks.user, updateUser: mocks.updateUser }) }));
vi.mock("../context/chatStore", () => ({ default: { getState: () => ({ fetchMemories: mocks.fetchMemories }) } }));
import MemoryPage from "./MemoryPage";

let records;
const base = { id: "location", fact: "I now live in Bengaluru", category: "personal", kind: "semantic",
  version: 2, confirmed: false, provenance: "rules", source_quote: "I now live in Bengaluru",
  valid_from: "2026-10-01T10:00:00", revisions: [{ fact: "I live in Anantapur", version: 1, valid_until: "2026-10-01T10:00:00" }] };
const mount = () => render(<MemoryRouter><MemoryPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  records = [{ ...base }];
  mocks.user.preferences = { memory_enabled: true, memory_auto_capture: true };
  mocks.projectGet.mockResolvedValue({ data: { projects: [] } });
  mocks.memory.getAll.mockImplementation(async () => ({ data: { memories: [...records], total: records.length } }));
  mocks.memory.stats.mockImplementation(async () => ({ data: { total: records.length, pinned: 0, revisions: 1, review_needed: 0 } }));
  mocks.fetchMemories.mockResolvedValue();
  mocks.memory.create.mockImplementation(async body => {
    const memory = { ...base, ...body, id: "new", version: 1, revisions: [], confirmed: true, source_quote: body.fact };
    records.unshift(memory);
    return { data: { memory } };
  });
  mocks.memory.update.mockImplementation(async (id, body) => {
    const index = records.findIndex(memory => memory.id === id);
    records[index] = { ...records[index], ...body, version: records[index].version + 1 };
    return { data: { memory: records[index] } };
  });
  mocks.memory.delete.mockImplementation(async id => { records = records.filter(memory => memory.id !== id); });
  mocks.userAPI.updatePrefs.mockImplementation(async body => ({ data: { preferences: { ...mocks.user.preferences, ...body } } }));
  mocks.updateUser.mockImplementation(body => { mocks.user.preferences = body.preferences; });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Memory Studio", () => {
  it("shows exact source and superseded fact when a memory is selected", async () => {
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: base.fact, exact: true }));
    expect(screen.getByRole("heading", { name: "Evidence & history" })).toBeTruthy();
    expect(screen.getByText("I live in Anantapur", { exact: true })).toBeTruthy();
    expect(screen.getByText("Exact source quote")).toBeTruthy();
  });

  it("creates, corrects with version, pins and deletes using real server IDs", async () => {
    mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add a memory", exact: true }));
    await user.type(screen.getByLabelText("Fact", { exact: true }), "My goal is research");
    await user.click(screen.getByRole("button", { name: "Save memory", exact: true }));
    await screen.findByRole("button", { name: "My goal is research", exact: true });
    await user.click(screen.getByRole("button", { name: "Correct this fact", exact: true }));
    await user.clear(screen.getByLabelText("Correct memory"));
    await user.type(screen.getByLabelText("Correct memory"), "My goal is data science");
    await user.click(screen.getByRole("button", { name: "Save correction", exact: true }));
    await screen.findByRole("button", { name: "My goal is data science", exact: true });
    expect(mocks.memory.update).toHaveBeenCalledWith("new", { fact: "My goal is data science", expected_version: 1 });
    await user.click(screen.getAllByRole("button", { name: "Pin memory", exact: true })[0]);
    await waitFor(() => expect(mocks.memory.update).toHaveBeenCalledWith("new", { pinned: true, expected_version: 2 }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Delete memory" })[0].disabled).toBe(false));
    await user.click(screen.getAllByRole("button", { name: "Delete memory" })[0]);
    await waitFor(() => expect(mocks.memory.delete).toHaveBeenCalledWith("new"));
  });

  it("shows retrieved evidence and account pause behavior", async () => {
    mocks.memory.recall.mockImplementation(async () => ({ data: mocks.user.preferences.memory_enabled ?
      { used: [{ id: "goal", fact: "My goal is research", source_quote: "My goal is research", reason: "Matched: goal", version: 1, score: 2 }], candidates: 1, context_chars: 120 } :
      { used: [], disabled: true, context_chars: 2, candidates: 0 } }));
    mount();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: base.fact, exact: true });
    await user.click(screen.getByRole("button", { name: "Recall explorer" }));
    await user.type(screen.getByLabelText("Your question"), "What is my goal?");
    await user.click(screen.getByRole("button", { name: "Run recall" }));
    await screen.findByText("My goal is research", { exact: true });
    expect(mocks.memory.recall).toHaveBeenCalledWith({ query: "What is my goal?", project_id: null });
    await user.click(screen.getByLabelText("Memory enabled", { exact: true }));
    await waitFor(() => expect(screen.getByLabelText("Memory enabled", { exact: true }).checked).toBe(false));
    await user.click(screen.getByRole("button", { name: "Run recall" }));
    await screen.findByText("Memory is paused. Enable it above to inspect recall.");
    expect(mocks.userAPI.updatePrefs).toHaveBeenCalledWith({ memory_enabled: false });
  });

  it("distinguishes failed loading from an empty memory library", async () => {
    mocks.memory.getAll.mockRejectedValueOnce(new Error("offline"));
    mount();
    const user = userEvent.setup();
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("button", { name: base.fact, exact: true });
  });
});
