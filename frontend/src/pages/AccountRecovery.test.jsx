import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const mocks = vi.hoisted(() => ({ forgotPw: vi.fn(), resetPw: vi.fn(), verifyEmail: vi.fn() }));
vi.mock("../services/api", () => ({ authAPI: mocks }));
vi.mock("../components/AppShell", () => ({ Brand: () => <span>NeuroSense</span> }));
vi.mock("../components/ConnectionSettings", () => ({ default: () => null }));
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("keeps recovery connected to the API and shows an inline retry then confirmation", async () => {
  mocks.forgotPw.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ data: {} });
  render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText("Email address"), "owner@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  await screen.findByText(/If an account uses this address/);
  expect(mocks.forgotPw).toHaveBeenLastCalledWith({ email: "owner@example.com" });
});
it("submits the actual reset token and returns to sign-in after success", async () => {
  mocks.resetPw.mockResolvedValue({ data: {} });
  render(<MemoryRouter initialEntries={["/reset-password/reset-test-token"]}><Routes><Route path="/reset-password/:token" element={<ResetPassword />} /><Route path="/login" element={<h1>Sign in</h1>} /></Routes></MemoryRouter>);
  await userEvent.type(screen.getByLabelText("New password"), "a-test-password");
  await userEvent.click(screen.getByRole("button", { name: "Update password" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(mocks.resetPw).toHaveBeenCalledWith("reset-test-token", { password: "a-test-password" });
});
it("shows verification failure instead of a successful account state", async () => {
  mocks.verifyEmail.mockRejectedValue({ response: { data: { detail: "Expired verification link" } } });
  render(<MemoryRouter initialEntries={["/verify-email/expired"]}><Routes><Route path="/verify-email/:token" element={<VerifyEmail />} /></Routes></MemoryRouter>);
  expect((await screen.findByRole("alert")).textContent).toBe("Expired verification link");
  expect(screen.queryByText("You're all set.")).toBeNull();
  expect(mocks.verifyEmail).toHaveBeenCalledWith("expired");
});
