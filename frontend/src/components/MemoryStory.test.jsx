import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemoryStory from "./MemoryStory";
afterEach(cleanup);
it("walks from the original words through review to later recall without accessing an account", async () => {
  render(<MemoryStory />);
  expect(screen.getByText(/We switched the backend/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(screen.getByText("Original user quotation")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Next step" }));
  await userEvent.click(screen.getByRole("button", { name: "Approve example" }));
  expect(screen.getByText(/The current decision is/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next step" }).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Show step 1" }));
  expect(screen.getByText(/We switched the backend/)).toBeTruthy();
});
