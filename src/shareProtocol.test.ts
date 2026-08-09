import { describe, expect, it } from "vitest";

import {
  CANVAS_SHARE_HASH_PREFIX,
  decodeCanvasShareHash,
} from "./shareProtocol";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function encodeFixture(value: unknown): Promise<string> {
  const compressed = new Blob([new TextEncoder().encode(JSON.stringify(value))])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  return `${CANVAS_SHARE_HASH_PREFIX}${bytesToBase64Url(bytes)}`;
}

describe("public Canvas viewer protocol", () => {
  it("decodes a versioned Canvas-only envelope", async () => {
    const hash = await encodeFixture({
      version: 1,
      canvas: {
        mode: "react",
        title: "Prototype",
        content: "function App(){ return <button>Start</button>; }",
      },
    });

    await expect(decodeCanvasShareHash(hash)).resolves.toEqual({
      version: 1,
      canvas: {
        mode: "react",
        title: "Prototype",
        content: "function App(){ return <button>Start</button>; }",
      },
    });
  });

  it("decodes a large Canvas without buffering the stream to a deadlock", async () => {
    const content =
      `function App(){const [step,setStep]=React.useState(0);return <button onClick={()=>setStep(step+1)}>Step {step}</button>;}`.repeat(
        180
      );
    const hash = await encodeFixture({
      version: 1,
      canvas: { mode: "react", title: "Large prototype", content },
    });

    const decoded = await decodeCanvasShareHash(hash);
    expect(decoded.canvas.content).toBe(content);
  });

  it("rejects session-shaped or corrupted payloads", async () => {
    const sessionHash = await encodeFixture({
      version: 1,
      sessionId: "secret-session",
      events: [],
    });
    await expect(decodeCanvasShareHash(sessionHash)).rejects.toThrow(
      "unsupported data"
    );
    await expect(
      decodeCanvasShareHash(`${CANVAS_SHARE_HASH_PREFIX}broken`)
    ).rejects.toThrow("incomplete or invalid");
  });

  it("requires the versioned share route", async () => {
    await expect(decodeCanvasShareHash("#/gallery/g1/payload")).rejects.toThrow(
      "not a Canvas share link"
    );
  });

  it("rejects an oversized Canvas even when it compresses into a short link", async () => {
    const hash = await encodeFixture({
      version: 1,
      canvas: { mode: "html", content: "x".repeat(512 * 1024 + 1) },
    });
    await expect(decodeCanvasShareHash(hash)).rejects.toThrow(
      "unsupported data"
    );
  });
});
