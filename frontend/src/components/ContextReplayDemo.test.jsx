import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextReplayDemo from "./ContextReplayDemo";
afterEach(cleanup);
it("walks through a labeled example without rewriting the historical answer", async () => {
  render(<ContextReplayDemo />);
  expect(screen.getByText("No account records or AI requests")).toBeTruthy();
  for (const name of ["Preview example change", "Apply example correction", "Replay example evidence", "Approve example evidence note"]) await userEvent.click(screen.getByRole("button", { name }));
  expect(screen.getByRole("status").textContent).toContain("original answer remains historical");
  expect(screen.getByText('Answer: “Use Flask for the prototype.”')).toBeTruthy();
  expect(screen.getAllByText("We use FastAPI for async support.").length).toBe(2);
});
it("makes sample scope exclusions and one-turn choices inspectable", async () => {
  render(<ContextReplayDemo />);
  await userEvent.click(screen.getByRole("button", { name: "Recall decisions" }));
  expect(screen.getAllByText("Source text and identifier withheld.").length).toBe(2);
  await userEvent.click(screen.getByRole("checkbox", { name: "Include the research project scope" }));
  expect(screen.getByText('Project: “We use FastAPI for async support.”')).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Clarify a decision" }));
  await userEvent.click(screen.getByRole("button", { name: /Use FastAPI for async support/ }));
  expect(screen.getByRole("status").textContent).toContain("sample memories were not edited");
});
