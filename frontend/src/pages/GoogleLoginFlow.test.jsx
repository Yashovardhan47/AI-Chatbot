import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
const mocks = vi.hoisted(() => ({ login: vi.fn(), googleLogin: vi.fn(), config: vi.fn() }));
vi.mock("../context/authStore", () => ({ default: selector => {
  const state = { user: null, login: mocks.login, googleLogin: mocks.googleLogin, sessionError: "" }; return selector ? selector(state) : state;
} }));
vi.mock("../services/api", () => ({ authAPI: { config: mocks.config } }));
vi.mock("../components/AuthLayout", () => ({ default: ({ children }) => <main>{children}</main> }));
import LoginPage from "./LoginPage";
function Destination() { const location = useLocation(); return <output>{location.pathname + location.search}</output>; }
afterEach(() => { cleanup(); delete window.google; vi.clearAllMocks(); });
it("uses the official Google callback and continues to the requested workspace page", async () => {
  const initialize = vi.fn(), renderButton = vi.fn(); window.google = { accounts: { id: { initialize, renderButton } } };
  mocks.config.mockResolvedValue({ data: { google_enabled: true, google_client_id: "real-server-client-id", password_login: true } });
  mocks.googleLogin.mockResolvedValue({ user: { id: "owner" }, access_token: "application-token" });
  render(<MemoryRouter initialEntries={["/login?next=%2Fknowledge%3Fdocument%3Dsource"]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/knowledge" element={<Destination />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(renderButton).toHaveBeenCalled());
  expect(initialize.mock.calls[0][0]).toMatchObject({ client_id: "real-server-client-id", ux_mode: "popup", auto_select: false });
  await act(async () => { await initialize.mock.calls[0][0].callback({ credential: "google-id-token" }); });
  expect(mocks.googleLogin).toHaveBeenCalledWith("google-id-token");
  expect(await screen.findByText("/knowledge?document=source")).toBeTruthy();
});
