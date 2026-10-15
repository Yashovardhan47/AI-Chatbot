import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const mocks = vi.hoisted(() => ({ user: { id: "owner", name: "Alex", preferences: {} }, updateUser: vi.fn(), preferences: vi.fn(), overview: vi.fn(), review: vi.fn(), newChat: vi.fn(), fetchChats: vi.fn(), complete: vi.fn(), session: vi.fn(), sessions: vi.fn(), rotate: vi.fn() }));
vi.mock("../context/authStore", () => ({ default: selector => selector ? selector({ user: mocks.user, updateUser: mocks.updateUser }) : { user: mocks.user, updateUser: mocks.updateUser } }));
vi.mock("../context/chatStore", () => ({ default: () => ({ chats: [], fetchChats: mocks.fetchChats, newChat: mocks.newChat }) }));
vi.mock("../services/api", () => ({ userAPI: { updatePrefs: mocks.preferences }, continuityAPI: { overview: mocks.overview, update: mocks.complete }, workspaceAPI: { review: mocks.review, sessions: mocks.sessions }, authAPI: { session: mocks.session }, refreshAccessToken: mocks.rotate }));
vi.mock("../components/GoogleButton", () => ({ default: () => <div>Official Google control</div> }));
vi.mock("../components/AppShell", () => ({ Brand: () => <span>NeuroSense</span> }));
import SetupPage from "./SetupPage";
import HomePage from "./DashboardPage";
import TourPage from "./TourPage";
import SecurityPage from "./SecurityPage";
function Destination() { const location = useLocation(); return <output data-testid="destination">{JSON.stringify(location)}</output>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { id: "owner", name: "Alex", preferences: { memory_enabled: true, memory_review_required: true } };
  mocks.overview.mockResolvedValue({ data: { counts: { memories: 2, documents: 1, pending_tasks: 1 }, projects: [{ id: "project-id", name: "Research project" }], tasks: [{ id: "task-id", title: "Read the brief", version: 4 }] } });
  mocks.review.mockResolvedValue({ data: { total: 1 } }); mocks.newChat.mockResolvedValue({ id: "new-thread" });
});
afterEach(cleanup);
it("saves the selected memory policy and resumes the requested page", async () => {
  mocks.preferences.mockResolvedValue({ data: { preferences: { onboarding_completed: true } } });
  render(<MemoryRouter initialEntries={["/setup?next=%2Fknowledge"]}><Routes><Route path="/setup" element={<SetupPage />} /><Route path="/knowledge" element={<Destination />} /></Routes></MemoryRouter>);
  await userEvent.click(screen.getByRole("radio", { name: /Only when I ask/ }));
  await userEvent.type(screen.getByLabelText(/What are you working toward/), "My research");
  await userEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  await screen.findByTestId("destination");
  expect(mocks.preferences).toHaveBeenCalledWith(expect.objectContaining({ onboarding_completed: true, workspace_goal: "My research", memory_review_required: false, memory_auto_capture: false }));
  expect(mocks.updateUser).toHaveBeenCalled();
});
it("opens a project-scoped conversation and carries the home draft without sending it", async () => {
  render(<MemoryRouter initialEntries={["/home"]}><Routes><Route path="/home" element={<HomePage />} /><Route path="/chat/:id" element={<Destination />} /></Routes></MemoryRouter>);
  await screen.findByRole("option", { name: "Research project" });
  await userEvent.selectOptions(screen.getByLabelText("Conversation context"), "project-id");
  await userEvent.type(screen.getByLabelText("Start a conversation"), "Review the architecture");
  await userEvent.click(screen.getByRole("button", { name: "Open conversation" }));
  const destination = await screen.findByTestId("destination");
  expect(mocks.newChat).toHaveBeenCalledWith("project-id");
  expect(JSON.parse(destination.textContent)).toMatchObject({ pathname: "/chat/new-thread", state: { draft: "Review the architecture" } });
});
it("completes a home commitment using its current server version", async () => {
  mocks.complete.mockResolvedValue({}); render(<MemoryRouter><HomePage /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "Complete Read the brief" }));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith("task-id", { status: "done", expected_version: 4 }));
});
it("lets visitors inspect memory history and authentication limitations in the tour", async () => {
  render(<MemoryRouter><TourPage /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Memory Studio" }));
  await userEvent.click(screen.getByRole("button", { name: "Version 1" }));
  expect(screen.getByText("Python + Flask for the backend.")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Account security" }));
  expect(screen.getByText(/This tour does not simulate a successful authentication check/)).toBeTruthy();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("rotates the real session before requesting verification again", async () => {
  mocks.session.mockResolvedValue({ data: { checked_at: "2026-10-15T12:00:00Z", expires_at: "2026-10-15T13:00:00Z", issuer: "neurosense-api", audience: "neurosense-workspace", sign_in_method: "google", refresh_cookie_active: true } });
  mocks.sessions.mockResolvedValue({ data: { sessions: [] } }); mocks.rotate.mockResolvedValue("fresh-token");
  render(<MemoryRouter><SecurityPage /></MemoryRouter>);
  await screen.findByText("Server verified");
  await userEvent.click(screen.getByRole("button", { name: "Rotate & verify" }));
  await waitFor(() => expect(mocks.session).toHaveBeenCalledTimes(2));
  expect(mocks.rotate).toHaveBeenCalledOnce(); expect(screen.getByText("Google", { selector: "dd" })).toBeTruthy();
});
