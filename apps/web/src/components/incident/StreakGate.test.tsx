import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import StreakGate from "./StreakGate";

afterEach(() => cleanup());

describe("StreakGate proof grid", () => {
  it("renders exact target columns regardless of CSS layout", () => {
    const { container, getByRole } = render(
      <StreakGate count={0} target={50} status="verifying" />,
    );

    const grid = getByRole("img", { name: /0 of 50 consecutive good parts/ });
    expect(grid).not.toBeNull();

    // Exactly 50 cells regardless of the CSS grid layout wrapping.
    expect(grid.querySelectorAll("span")).toHaveLength(50);

    // The grid exposes its target as a CSS custom property so the layout
    // (grid-template-columns: repeat(var(--streak-target, 50), minmax(0, 1fr)))
    // matches the rendered cell count for any target value.
    const inlineStyle = (grid as HTMLElement).style.getPropertyValue("--streak-target");
    expect(inlineStyle).toBe("50");

    // Sanity check: container still mounts the StreakGate root with the expected class.
    expect(container.querySelector(".proof-grid")).not.toBeNull();
  });

  it("adapts the cell count and --streak-target when target changes", () => {
    const { getByRole } = render(
      <StreakGate count={3} target={10} status="verifying" />,
    );

    const grid = getByRole("img", { name: /3 of 10 consecutive good parts/ });
    expect(grid.querySelectorAll("span")).toHaveLength(10);

    const inlineStyle = (grid as HTMLElement).style.getPropertyValue("--streak-target");
    expect(inlineStyle).toBe("10");
  });
});
