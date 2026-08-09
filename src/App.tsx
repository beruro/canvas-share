import { Suspense, lazy, useEffect, useState } from "react";

import FlowField from "./variants/FlowField";
import PhysicsBox from "./variants/PhysicsBox";
import SketchBoard from "./variants/SketchBoard";

const SharedCanvasPage = lazy(() => import("./SharedCanvasPage"));

type VariantDef = {
  id: string;
  label: string;
  sub: string;
  Component: () => JSX.Element;
};

const VARIANTS: VariantDef[] = [
  { id: "flow", label: "流场", sub: "Flow Field", Component: FlowField },
  { id: "sketch", label: "画板", sub: "Sketch Board", Component: SketchBoard },
  { id: "physics", label: "弹珠", sub: "Physics Toy", Component: PhysicsBox },
];

type Route =
  | { kind: "gallery"; variantId: string }
  | { kind: "share"; hash: string };

function routeFromHash(): Route {
  const hash = window.location.hash;
  if (hash.startsWith("#/share/g1/")) return { kind: "share", hash };
  const id = hash.replace(/^#\/?/, "");
  return {
    kind: "gallery",
    variantId: VARIANTS.some((variant) => variant.id === id)
      ? id
      : VARIANTS[0].id,
  };
}

function Gallery({ active }: { active: string }) {
  const current =
    VARIANTS.find((variant) => variant.id === active) ?? VARIANTS[0];
  const Active = current.Component;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-title">
          画布集
          <span className="shell-title-en">Canvas Gallery</span>
        </div>
        <nav className="shell-tabs" aria-label="画布切换">
          {VARIANTS.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className={`shell-tab${variant.id === current.id ? "is-active" : ""}`}
              onClick={() => {
                window.location.hash = `/${variant.id}`;
              }}
            >
              {variant.label}
              <span className="shell-tab-sub">{variant.sub}</span>
            </button>
          ))}
        </nav>
        <a
          className="shell-source"
          href="https://github.com/beruro/canvas-share"
          target="_blank"
          rel="noreferrer"
        >
          源码
        </a>
      </header>
      <main className="shell-stage" key={current.id}>
        <Active />
      </main>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);

  // Browser location is the external navigation source for both gallery and
  // self-contained Canvas links; cleanup keeps Strict Mode remounts safe.
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.kind === "share") {
    return (
      <Suspense fallback={<div className="share-state">Opening Canvas…</div>}>
        <SharedCanvasPage hash={route.hash} />
      </Suspense>
    );
  }
  return <Gallery active={route.variantId} />;
}
