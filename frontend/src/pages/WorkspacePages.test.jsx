import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ get: vi.fn(), knowledge: { list: vi.fn(), note: vi.fn(), get: vi.fn(), query: vi.fn() },
  graph: { get: vi.fn(), create: vi.fn(), delete: vi.fn() }, memory: { index: vi.fn() },
  continuity: { tasks: vi.fn(), sessions: vi.fn(), notifications: vi.fn(), overview: vi.fn(), create: vi.fn(), update: vi.fn(), read: vi.fn() } }));
vi.mock("../services/api", () => ({ default: { get: mocks.get }, knowledgeAPI: mocks.knowledge, graphAPI: mocks.graph,
  memoryAPI: mocks.memory, continuityAPI: mocks.continuity, saveDownload: vi.fn() }));
vi.mock("../context/authStore", () => ({ default: () => ({ user: { preferences: { timezone: "Asia/Kolkata" } } }) }));
import KnowledgePage from "./KnowledgePage";
import GraphPage from "./GraphPage";
import ContinuityPage from "./ContinuityPage";

beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue({ data: { projects: [] } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("saves knowledge notes and shows grounded retrieval passages", async () => {
  let docs = [];
  const document = { id: "doc1", title: "Research brief", filename: "brief.txt", chunks: 1, text_chars: 45, indexed_chunks: 0 };
  mocks.knowledge.list.mockImplementation(async () => ({ data: { documents: [...docs], total: docs.length } }));
  mocks.knowledge.note.mockImplementation(async () => { docs = [document]; return { data: { document } }; });
  mocks.knowledge.get.mockResolvedValue({ data: { document, passages: [{ id: "c1", ordinal: 1, text: "The project uses Python and durable memory." }] } });
  mocks.knowledge.query.mockResolvedValue({ data: { used: [{ id: "c1", document_id: "doc1", title: document.title, ordinal: 1, fact: "Python powers the API" }], retrieval_mode: "lexical", answer: null } });
  render(<MemoryRouter><KnowledgePage/></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Save note", exact: true }));
  await user.type(screen.getByLabelText("Title"), document.title);
  await user.type(screen.getByLabelText("Note"), "The project uses Python and durable memory.");
  await user.click(within(screen.getByRole("dialog", { name: "Save knowledge note" })).getByRole("button", { name: "Save note", exact: true }));
  await screen.findByText("The project uses Python and durable memory.");
  await user.type(screen.getByLabelText("Ask Research brief"), "Python API");
  await user.click(screen.getByRole("button", { name: "Search knowledge" }));
  await screen.findByText("Python powers the API");
  expect(mocks.knowledge.query).toHaveBeenCalledWith({ query: "Python API", project_id: null, document_id: "doc1", generate_answer: false });
});

it("creates explicit graph relationships using owner record IDs", async () => {
  mocks.graph.get.mockResolvedValue({ data: { nodes: [{ id: "a", fact: "My goal is research", category: "goal", version: 1 },
    { id: "b", fact: "I use Python", category: "skill", version: 1 }], edges: [], total_nodes: 2 } });
  mocks.graph.create.mockResolvedValue({ data: {} });
  render(<MemoryRouter><GraphPage/></MemoryRouter>);
  const user = userEvent.setup();
  await waitFor(() => expect(within(screen.getByLabelText("Source fact")).getByRole("option", { name: "My goal is research" })).toBeTruthy());
  await user.selectOptions(screen.getByLabelText("Source fact"), "a");
  await user.selectOptions(screen.getByLabelText("Target fact"), "b");
  await user.selectOptions(screen.getByLabelText("Relationship"), "depends_on");
  await user.click(screen.getByRole("button", { name: "Connect", exact: true }));
  await waitFor(() => expect(mocks.graph.create).toHaveBeenCalledWith({ source_id: "a", target_id: "b", relation: "depends_on" }));
});

it("creates commitments, completes with a version, and marks reminders read", async () => {
  let tasks = [];
  mocks.continuity.tasks.mockImplementation(async () => ({ data: { tasks } }));
  mocks.continuity.sessions.mockResolvedValue({ data: { sessions: [] } });
  mocks.continuity.notifications.mockResolvedValue({ data: { notifications: [{ id: "n1", title: "Run evaluation", message: "Due now", read: false, created_at: "2026-10-13T09:00:00", email_status: "disabled" }] } });
  mocks.continuity.overview.mockResolvedValue({ data: { counts: { pending_tasks: 1, completed_tasks: 0, sessions: 0, unread_notifications: 1 }, projects: [] } });
  mocks.continuity.create.mockImplementation(async body => { tasks = [{ ...body, id: "t1", version: 1, status: "pending" }]; });
  mocks.continuity.update.mockResolvedValue({ data: {} }); mocks.continuity.read.mockResolvedValue({ data: {} });
  render(<MemoryRouter><ContinuityPage/></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New commitment" }));
  await user.type(screen.getByLabelText("Title"), "Run evaluation");
  await user.click(screen.getByRole("button", { name: "Save commitment" }));
  await screen.findByRole("heading", { name: "Run evaluation" });
  await user.click(screen.getByRole("button", { name: "Complete commitment" }));
  await waitFor(() => expect(mocks.continuity.update).toHaveBeenCalledWith("t1", { status: "done", expected_version: 1 }));
  await user.click(screen.getByRole("button", { name: "Inbox" }));
  await user.click(await screen.findByRole("button", { name: "Mark read" }));
  await waitFor(() => expect(mocks.continuity.read).toHaveBeenCalledWith("n1"));
});
