import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, test } from "vitest";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableHead,
} from "@kyzn/ui";

describe("shared Button", () => {
  test("renders its accessible label and native button behavior", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  test("supports variants, submit type, and disabled state", () => {
    render(
      <Button type="submit" variant="outline" size="sm" disabled>
        Save lead
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Save lead" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(screen.getByRole("button", { name: "Save lead" })).toBeDisabled();
  });
});

describe("shared form and table primitives", () => {
  test("forwards an input ref for focus management", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Membership note" />);

    ref.current?.focus();

    expect(document.activeElement).toBe(ref.current);
  });

  test("preserves the native table header scope", () => {
    render(
      <table>
        <thead>
          <tr>
            <TableHead scope="col">Lead name</TableHead>
          </tr>
        </thead>
      </table>,
    );

    expect(
      screen.getByRole("columnheader", { name: "Lead name" }),
    ).toHaveAttribute("scope", "col");
  });
});

function SourceSelect() {
  const [source, setSource] = useState("");

  return (
    <div>
      <Label htmlFor="source">Source</Label>
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger id="source">
          <SelectValue placeholder="Choose a source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="website">Website</SelectItem>
          <SelectItem value="referral">Referral</SelectItem>
        </SelectContent>
      </Select>
      <output aria-label="Selected source">{source}</output>
    </div>
  );
}

describe("shared Select", () => {
  test("opens and selects an option with the keyboard", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => {},
    });
    render(<SourceSelect />);
    const trigger = screen.getByRole("combobox", { name: "Source" });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(
      await screen.findByRole("option", { name: "Website" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? trigger, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement ?? trigger, { key: "Enter" });

    expect(await screen.findByLabelText("Selected source")).toHaveTextContent(
      "website",
    );
  });
});
