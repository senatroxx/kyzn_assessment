import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "./router";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("lead management shell", () => {
  test("loads the lead list and exposes app navigation", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Leads" }),
    ).toBeInTheDocument();
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "http://localhost:3000",
    );
    expect(screen.getByRole("link", { name: "New lead" })).toHaveAttribute(
      "href",
      "/leads/new",
    );
  });

  test("opens the new lead placeholder from navigation", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Leads" });
    fireEvent.click(screen.getByRole("link", { name: "Create a lead" }));
    expect(
      await screen.findByRole("heading", { name: "New lead" }),
    ).toBeInTheDocument();
  });

  test("loads a direct edit URL and provides an unknown-route recovery link", async () => {
    window.history.replaceState({}, "", "/leads/lead-123/edit");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Edit lead" }),
    ).toBeInTheDocument();

    cleanup();
    window.history.replaceState({}, "", "/missing-page");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to leads" }),
    ).toHaveAttribute("href", "/leads");
  });
});
