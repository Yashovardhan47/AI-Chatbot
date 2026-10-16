import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
const mocks = vi.hoisted(() => ({ state: { user: null, loading: false }, config: vi.fn() }));
vi.mock("./context/authStore", () => ({ default: selector => selector ? selector(mocks.state) : mocks.state }));
vi.mock("./components/AppShell", () => ({ default: ({ children }) => <div data-testid="account-shell">{children}</div>, Brand: () => <span>NeuroSense</span> }));
vi.mock("./services/api", () => ({ authAPI: { config: mocks.config } }));
vi.mock("./pages/DashboardPage", () => ({ default: () => <h1>Account home</h1> }));
vi.mock("./pages/SetupPage", () => ({ default: () => <h1>First-time setup</h1> }));
vi.mock("./pages/ChatPage", () => ({ default: () => <h1>Private conversation</h1> }));
import { AppRoutes } from "./App";
function Location() { const value = useLocation(); return <output data-testid="location">{value.pathname + value.search}</output>; }
function open(path) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /><Location /></MemoryRouter>); }
beforeEach(() => { mocks.state = { user: null, loading: false }; mocks.config.mockResolvedValue({ data: { google_enabled: false, password_login: true } }); });
afterEach(cleanup);
it("keeps the project overview public and outside the account shell", () => {
  mocks.state.user = { id: "owner", preferences: { onboarding_completed: true } }; open("/");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("longer memory");
  expect(screen.queryByTestId("account-shell")).toBeNull(); expect(screen.getAllByRole("link", { name: /Open home/ })[0].getAttribute("href")).toBe("/home");
});
it("preserves a protected deep link when requesting sign-in", async () => {
  open("/chat/thread-123?source=memory");
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/login?next=%2Fchat%2Fthread-123%3Fsource%3Dmemory"));
});
it("preserves a context review destination through sign-in", async () => {
  open("/context-lab?change=change-123");
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/login?next=%2Fcontext-lab%3Fchange%3Dchange-123"));
});
it("renders the signed-in home as a different page", async () => {
  mocks.state.user = { id: "owner", preferences: { onboarding_completed: true } }; open("/home");
  await screen.findByRole("heading", { name: "Account home" }); expect(screen.getByTestId("account-shell")).toBeTruthy();
});
it("takes a new account through memory setup before the requested conversation", async () => {
  mocks.state.user = { id: "owner", preferences: {} }; open("/chat/thread-123");
  await screen.findByText("First-time setup"); expect(screen.getByTestId("location").textContent).toBe("/setup?next=%2Fchat%2Fthread-123");
});
it("rejects external return destinations after sign-in", async () => {
  mocks.state.user = { id: "owner", preferences: { onboarding_completed: true } }; open("/login?next=https%3A%2F%2Fevil.example");
  await screen.findByText("Account home"); expect(screen.getByTestId("location").textContent).toBe("/home");
});
it("keeps old dashboard bookmarks working", async () => {
  mocks.state.user = { id: "owner", preferences: { onboarding_completed: true } }; open("/dashboard");
  await screen.findByText("Account home"); expect(screen.getByTestId("location").textContent).toBe("/home");
});
