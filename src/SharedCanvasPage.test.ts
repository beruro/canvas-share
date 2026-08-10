import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  buildSharedHtmlDocument,
  SharedHtmlCanvas,
} from "./SharedCanvasPage";

describe("shared HTML Canvas viewport", () => {
  it("renders a fixed-height HTML fragment as a full-viewport Canvas", () => {
    const fragment =
      '<div style="height:680px;border:1px solid;border-radius:18px;box-shadow:0 18px 60px #000">Canvas</div>';
    const document = buildSharedHtmlDocument(fragment);

    expect(document).toContain(
      "html,body{width:100%;height:100%;min-height:100%;margin:0"
    );
    expect(document).toContain("body{padding:0;overflow:auto}");
    expect(document).toContain(
      "body>:only-child{min-height:100%;border:0!important;border-radius:0!important;box-shadow:none!important}"
    );
    expect(document).not.toContain("padding:16px");

    const markup = renderToStaticMarkup(
      createElement(SharedHtmlCanvas, { content: fragment })
    );
    expect(markup).toContain('class="shared-runtime-frame"');
    expect(markup).toContain("body{padding:0;overflow:auto}");
  });

  it("preserves a complete HTML document exactly as authored", () => {
    const document =
      '<!doctype html><html><head><style>body{padding:24px}</style></head><body><main>Canvas</main></body></html>';

    expect(buildSharedHtmlDocument(document)).toBe(document);
  });
});
