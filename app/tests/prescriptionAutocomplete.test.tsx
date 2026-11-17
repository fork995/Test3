// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PrescriptionAutocomplete } from "../src/PrescriptionAutocomplete";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLInputElement.prototype, "getBoundingClientRect").mockReturnValue(
    {
      left: 20,
      right: 320,
      top: 300,
      bottom: 344,
      width: 300,
      height: 44,
      x: 20,
      y: 300,
      toJSON: () => ({}),
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Example() {
  const [value, setValue] = useState("");
  return (
    <>
      <PrescriptionAutocomplete
        label="Test"
        value={value}
        onChange={setValue}
        options={["20", "100"]}
      />
      <button>Outside</button>
    </>
  );
}
async function mount() {
  await act(async () => root.render(<Example />));
  const input = host.querySelector("input")!;
  await act(async () => input.focus());
  return input;
}
it("fits above the field in the keyboard viewport and marks the keyboard-selected option", async () => {
  const viewport = new EventTarget() as EventTarget & {
    height: number;
    offsetTop: number;
    width: number;
    offsetLeft: number;
  };
  Object.assign(viewport, {
    height: 430,
    offsetTop: 0,
    width: 375,
    offsetLeft: 0,
  });
  vi.stubGlobal("visualViewport", viewport);
  const input = await mount();
  const list = host.querySelector("ul")!;
  expect(parseFloat(list.style.top)).toBeLessThan(300);
  expect(list.style.width).toBe("300px");
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(host.querySelector("[aria-selected=true]")?.textContent).toBe("20");
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(input.value).toBe("20");
  expect(host.querySelector("ul")).toBeNull();
});
it("repositions on visualViewport resize/scroll, closes on blur and Escape", async () => {
  const viewport = new EventTarget() as EventTarget & {
    height: number;
    offsetTop: number;
    width: number;
    offsetLeft: number;
  };
  Object.assign(viewport, {
    height: 844,
    offsetTop: 0,
    width: 390,
    offsetLeft: 0,
  });
  vi.stubGlobal("visualViewport", viewport);
  const input = await mount();
  expect(parseFloat(host.querySelector("ul")!.style.top)).toBe(348);
  viewport.height = 430;
  await act(async () => {
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(parseFloat(host.querySelector("ul")!.style.top)).toBeLessThan(300);
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(host.querySelector("ul")).toBeNull();
  await act(async () => input.click());
  expect(host.querySelector("ul")).toBeTruthy();
  await act(async () => host.querySelector("button")!.focus());
  expect(host.querySelector("ul")).toBeNull();
});

it("panned visual viewport and disabled saving state keep the popup bounded", async () => {
  const viewport = new EventTarget() as EventTarget & {
    height: number;
    offsetTop: number;
    width: number;
    offsetLeft: number;
  };
  Object.assign(viewport, {
    height: 200,
    offsetTop: 200,
    width: 375,
    offsetLeft: 0,
  });
  vi.stubGlobal("visualViewport", viewport);
  await mount();
  const list = host.querySelector("ul")!;
  expect(parseFloat(list.style.top)).toBeGreaterThanOrEqual(200);
  expect(
    parseFloat(list.style.top) + parseFloat(list.style.maxHeight),
  ).toBeLessThanOrEqual(400);
  await act(async () =>
    root.render(
      <PrescriptionAutocomplete
        label="Test"
        value=""
        onChange={() => {}}
        options={["20", "100"]}
        disabled
      />,
    ),
  );
  expect(host.querySelector("ul")).toBeNull();
});
