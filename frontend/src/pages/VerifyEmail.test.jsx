import React, { StrictMode } from "react";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ verifyEmail: vi.fn(), resendVerification: vi.fn() }));
vi.mock("../services/api", () => ({ authAPI: api }));
vi.mock("../components/AuthLayout", () => ({ default: ({ title, children }) => <main><h1>{title}</h1>{children}</main> }));
import VerifyEmail from "./VerifyEmail";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function open(token) {
  return render(<StrictMode><MemoryRouter initialEntries={["/verify-email/" + token]}><Routes>
    <Route path="/verify-email/:token" element={<VerifyEmail />} />
  </Routes></MemoryRouter></StrictMode>);
}
it("consumes a one-time verification link once during StrictMode effect replay", async () => {
  let complete;
  api.verifyEmail.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  open("strict-mode-token");
  expect(api.verifyEmail).toHaveBeenCalledTimes(1);
  await act(async () => complete({ data: { message: "Email verified" } }));
  expect(screen.getByRole("heading", { name: "You're all set." })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("lets an expired link request a fresh email with a generic response", async () => {
  api.verifyEmail.mockRejectedValue(new Error("expired"));
  api.resendVerification.mockResolvedValue({ data: { message: "If this account needs verification, a new link was sent." } });
  open("expired-token");
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Account email address"), { target: { value: "owner@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send a new verification link" }));
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(api.resendVerification).toHaveBeenCalledWith("owner@example.com");
});
