export const CANVAS_SHARE_PROTOCOL_VERSION = 1 as const;
export const CANVAS_SHARE_HASH_PREFIX = "#/share/g1/";
const MAX_CANVAS_SHARE_SOURCE_BYTES = 512 * 1024;
const MAX_CANVAS_SHARE_ENVELOPE_BYTES =
  MAX_CANVAS_SHARE_SOURCE_BYTES * 2 + 16 * 1024;

const CANVAS_SHARE_MODES = new Set(["html", "react", "a2ui", "url"]);

export interface SharedCanvasSnapshot {
  mode: "html" | "react" | "a2ui" | "url";
  title?: string;
  content?: string;
  url?: string;
}

export interface CanvasShareEnvelopeV1 {
  version: typeof CANVAS_SHARE_PROTOCOL_VERSION;
  canvas: SharedCanvasSnapshot;
}

export class CanvasShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasShareDecodeError";
  }
}

function isPublicWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isCanvasShareEnvelope(
  value: unknown
): value is CanvasShareEnvelopeV1 {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== CANVAS_SHARE_PROTOCOL_VERSION) return false;
  if (!envelope.canvas || typeof envelope.canvas !== "object") return false;
  const canvas = envelope.canvas as Record<string, unknown>;
  if (typeof canvas.mode !== "string" || !CANVAS_SHARE_MODES.has(canvas.mode)) {
    return false;
  }
  if (canvas.title !== undefined && typeof canvas.title !== "string") {
    return false;
  }
  if (typeof canvas.title === "string" && canvas.title.length > 200) {
    return false;
  }
  if (canvas.mode === "url") {
    return (
      typeof canvas.url === "string" &&
      canvas.url.length <= 4_096 &&
      isPublicWebUrl(canvas.url)
    );
  }
  return (
    typeof canvas.content === "string" &&
    canvas.content.length > 0 &&
    new TextEncoder().encode(canvas.content).byteLength <=
      MAX_CANVAS_SHARE_SOURCE_BYTES
  );
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBufferSource(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new CanvasShareDecodeError(
      "This browser cannot open compressed Canvas links."
    );
  }
  const decompressed = new Blob([toBufferSource(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressed.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.done) continue;
    const { value } = result;
    total += value.byteLength;
    if (total > MAX_CANVAS_SHARE_ENVELOPE_BYTES) {
      await reader.cancel();
      throw new CanvasShareDecodeError(
        "This Canvas link exceeds the supported size."
      );
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function encodedPayloadFromHash(hash: string): string {
  if (hash.startsWith(CANVAS_SHARE_HASH_PREFIX)) {
    return hash.slice(CANVAS_SHARE_HASH_PREFIX.length);
  }
  throw new CanvasShareDecodeError("This is not a Canvas share link.");
}

export async function decodeCanvasShareHash(
  hash: string
): Promise<CanvasShareEnvelopeV1> {
  try {
    const encoded = encodedPayloadFromHash(hash);
    const json = new TextDecoder().decode(
      await gunzip(base64UrlToBytes(encoded))
    );
    const value: unknown = JSON.parse(json);
    if (!isCanvasShareEnvelope(value)) {
      throw new CanvasShareDecodeError(
        "This Canvas link contains unsupported data."
      );
    }
    return value;
  } catch (error) {
    if (error instanceof CanvasShareDecodeError) throw error;
    throw new CanvasShareDecodeError(
      "This Canvas link is incomplete or invalid."
    );
  }
}
