import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { App } from "./router";

describe("lead management placeholder", () => {
  test("renders the home page", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Lead management setup" }),
    ).toBeInTheDocument();
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });
});
