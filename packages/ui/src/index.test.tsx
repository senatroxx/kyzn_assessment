import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "@kyzn/ui";

describe("shared Button", () => {
  test("renders its accessible label", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});
