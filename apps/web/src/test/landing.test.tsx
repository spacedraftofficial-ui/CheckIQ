import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "../pages/LandingPage";

/**
 * The landing screen is the entry point for every candidate. It must not
 * validate the Candidate ID itself — the server decides whether it can be
 * registered, and a duplicate is reported during signup.
 */
describe("LandingPage", () => {
  it("explains what the Candidate ID is used for", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /complete your background verification/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/candidate id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("does not block the candidate from continuing with an unregistered ID", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText(/candidate id/i);
    await user.type(input, "CIQ-2026-000999");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // The form is allowed to submit; no client-side validation blocks it.
    expect(input).toHaveValue("CIQ-2026-000999");
  });

  it("labels the Candidate ID field for assistive technology", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText(/candidate id/i);
    expect(input).toHaveAttribute("id", "candidateId");
    expect(input).toHaveAttribute("autocomplete", "off");
  });
});
