import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_SHARE_HASH_PREFIX,
  CANVAS_SHARE_SHORT_HASH_PREFIX,
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
  afterEach(() => vi.unstubAllGlobals());

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

  it("loads and validates a hosted snapshot from a compact share route", async () => {
    const embeddedHash = await encodeFixture({
      version: 1,
      canvas: {
        mode: "html",
        title: "Hosted",
        content: "<button>Open</button>",
      },
    });
    const payload = embeddedHash.slice(CANVAS_SHARE_HASH_PREFIX.length);
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ payload }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      decodeCanvasShareHash(
        `${CANVAS_SHARE_SHORT_HASH_PREFIX}abcdefghijklmnopqrstuv`,
        undefined,
        "https://api.example.test/canvas-shares"
      )
    ).resolves.toMatchObject({
      canvas: { title: "Hosted", content: "<button>Open</button>" },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/canvas-shares/abcdefghijklmnopqrstuv",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );
  });

  it("reports an expired or missing short link without decoding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    await expect(
      decodeCanvasShareHash(
        `${CANVAS_SHARE_SHORT_HASH_PREFIX}abcdefghijklmnopqrstuv`,
        undefined,
        "https://api.example.test/canvas-shares"
      )
    ).rejects.toThrow("expired or does not exist");
  });
});
