import { useEffect, useState } from "react";

import SharedA2UICanvas from "./SharedA2UICanvas";
import SharedReactCanvas from "./SharedReactCanvas";
import {
  type CanvasShareEnvelopeV1,
  decodeCanvasShareHash,
} from "./shareProtocol";

type DecodeState =
  | { phase: "loading" }
  | { phase: "ready"; envelope: CanvasShareEnvelopeV1 }
  | { phase: "error"; message: string };

function useDecodedCanvas(hash: string): DecodeState {
  const [state, setState] = useState<DecodeState>({ phase: "loading" });

  // URL hash is the external, immutable snapshot boundary. Ignore a decode
  // that completes after the hash changed or this view unmounted.
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setState({ phase: "loading" });
    void decodeCanvasShareHash(hash, controller.signal).then(
      (envelope) => {
        if (current) setState({ phase: "ready", envelope });
      },
      (error: unknown) => {
        if (!current) return;
        setState({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "This Canvas link could not be opened.",
        });
      }
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [hash]);

  return state;
}

function LoadingState() {
  return (
    <div className="share-state" role="status">
      <span className="share-state-dot" aria-hidden />
      <span>Opening Canvas…</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="share-state share-state-error" role="alert">
      <strong>Canvas unavailable</strong>
      <span>{message}</span>
    </div>
  );
}

const SHARED_HTML_FRAGMENT_STYLES =
  "*{box-sizing:border-box}" +
  "html,body{width:100%;height:100%;min-height:100%;margin:0;font-family:system-ui,-apple-system,sans-serif}" +
  "body{padding:0;overflow:auto}" +
  "body>:only-child{min-height:100%;border:0!important;border-radius:0!important;box-shadow:none!important}";

export function buildSharedHtmlDocument(content: string): string {
  const trimmed = content.trimStart().toLowerCase();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
    return content;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${SHARED_HTML_FRAGMENT_STYLES}</style></head><body>${content}</body></html>`;
}

export function SharedHtmlCanvas({ content }: { content: string }) {
  return (
    <iframe
      className="shared-runtime-frame"
      title="Shared HTML Canvas"
      srcDoc={buildSharedHtmlDocument(content)}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
    />
  );
}

function SharedUrlCanvas({ url }: { url: string }) {
  return (
    <div className="shared-url-stage">
      <div className="shared-url-card">
        <span className="shared-url-kicker">Linked web page</span>
        <strong>{new URL(url).hostname}</strong>
        <p>This Canvas points to an external website.</p>
        <a href={url} target="_blank" rel="noreferrer">
          Open website
        </a>
      </div>
    </div>
  );
}

function CanvasRuntime({ envelope }: { envelope: CanvasShareEnvelopeV1 }) {
  const { canvas } = envelope;
  if (canvas.mode === "react") {
    return <SharedReactCanvas source={canvas.content ?? ""} />;
  }
  if (canvas.mode === "a2ui") {
    return <SharedA2UICanvas content={canvas.content ?? ""} />;
  }
  if (canvas.mode === "url") {
    return <SharedUrlCanvas url={canvas.url ?? ""} />;
  }
  return <SharedHtmlCanvas content={canvas.content ?? ""} />;
}

export default function SharedCanvasPage({ hash }: { hash: string }) {
  const state = useDecodedCanvas(hash);
  if (state.phase === "loading") return <LoadingState />;
  if (state.phase === "error") return <ErrorState message={state.message} />;

  return (
    <main
      className="shared-canvas"
      aria-label={state.envelope.canvas.title || "Shared Canvas"}
    >
      <CanvasRuntime envelope={state.envelope} />
    </main>
  );
}
