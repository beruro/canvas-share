import { useEffect, useState } from "react";
import FlowField from "./variants/FlowField";
import SketchBoard from "./variants/SketchBoard";
import PhysicsBox from "./variants/PhysicsBox";

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

function variantFromHash(): string {
  const id = window.location.hash.replace(/^#\/?/, "");
  return VARIANTS.some((v) => v.id === id) ? id : VARIANTS[0].id;
}

export default function App() {
  const [active, setActive] = useState<string>(variantFromHash);

  // 与浏览器 URL hash 同步：分享 #/sketch 之类的链接可直达对应画布
  useEffect(() => {
    const onHashChange = () => setActive(variantFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const current = VARIANTS.find((v) => v.id === active) ?? VARIANTS[0];
  const Active = current.Component;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-title">
          画布集
          <span className="shell-title-en">Canvas Gallery</span>
        </div>
        <nav className="shell-tabs" aria-label="画布切换">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`shell-tab${v.id === current.id ? " is-active" : ""}`}
              onClick={() => {
                window.location.hash = `/${v.id}`;
              }}
            >
              {v.label}
              <span className="shell-tab-sub">{v.sub}</span>
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
      {/* key 强制切换时完全卸载旧画布，保证 rAF/监听器干净回收 */}
      <main className="shell-stage" key={current.id}>
        <Active />
      </main>
    </div>
  );
}
