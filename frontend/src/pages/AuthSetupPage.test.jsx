import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("../services/api", () => ({ authAPI: { config: mocks.config } }));
vi.mock("../components/PublicNav", () => ({ default: () => <nav>NeuroSense</nav> }));
vi.mock("../components/ConnectionSettings", () => ({ default: () => <button>Backend connection</button> }));
vi.mock("../components/GoogleButton", () => ({ default: () => <button disabled>Google provider control</button> }));
import AuthSetupPage from "./AuthSetupPage";
beforeEach(() => vi.clearAllMocks()); afterEach(cleanup);
it("reports a missing account service without claiming Google activation", async () => {
  mocks.config.mockRejectedValue(new Error("offline")); render(<MemoryRouter><AuthSetupPage /></MemoryRouter>);
  await screen.findByText(/cannot reach a configured NeuroSense/);
  expect(screen.queryByText("The server supplies a public Google client ID.")).toBeNull();
  expect(screen.getByRole("link", { name: /Open the sign-in flow/ }).getAttribute("href")).toBe("/login?next=%2Fsecurity");
});
it("distinguishes a reachable API from a missing Google web client", async () => {
  mocks.config.mockResolvedValue({ data: { google_enabled: false, google_client_id: null, password_login: true } });
  render(<MemoryRouter><AuthSetupPage /></MemoryRouter>);
  await screen.findByText("The authentication endpoint is reachable.");
  expect(screen.getByText(/server needs the Google OAuth web client ID/)).toBeTruthy();
  expect(screen.getByText(window.location.origin, { selector: "code" })).toBeTruthy();
});
it("shows configured client information while leaving origin and live login unverified", async () => {
  mocks.config.mockResolvedValue({ data: { google_enabled: true, google_client_id: "public-client.apps.googleusercontent.com", password_login: true } });
  render(<MemoryRouter><AuthSetupPage /></MemoryRouter>);
  await screen.findByText("The server supplies a public Google client ID.");
  expect(screen.getByText("public-client.apps.googleusercontent.com")).toBeTruthy();
  expect(screen.getByText(/registration is checked by Google during sign-in/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "4. Finish a live sign-in" })).toBeTruthy();
});
