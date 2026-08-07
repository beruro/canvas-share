import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Theme = {
  name: string;
  bg: string;
  accent: string;
  colors: readonly string[];
};

const THEMES: readonly Theme[] = [
  { name: "深海", bg: "#04090f", accent: "#38bdf8", colors: ["#38bdf8", "#22d3ee", "#0ea5e9", "#a5f3fc"] },
  { name: "熔金", bg: "#0b0704", accent: "#fbbf24", colors: ["#f59e0b", "#fbbf24", "#fb923c", "#fde68a"] },
  { name: "星夜", bg: "#070512", accent: "#a78bfa", colors: ["#a78bfa", "#818cf8", "#e879f9", "#c4b5fd"] },
  { name: "绯樱", bg: "#0f0509", accent: "#fb7185", colors: ["#fb7185", "#f472b6", "#fda4af", "#fecdd3"] },
];

const themeAt = (i: number): Theme =>
  THEMES[((i % THEMES.length) + THEMES.length) % THEMES.length] as Theme;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Seeded 2D value noise with 3-octave fBm, self-contained (no deps). */
function makeFbm(seed: number): (x: number, y: number) => number {
  const hash = (ix: number, iy: number): number => {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (u: number): number => u * u * (3 - 2 * u);
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    const ux = fade(fx);
    const uy = fade(fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  return (x: number, y: number): number => {
    let v = 0;
    let amp = 0.55;
    let f = 1;
    for (let i = 0; i < 3; i++) {
      v += amp * noise(x * f, y * f);
      amp *= 0.5;
      f *= 2.1;
    }
    return v;
  };
}

type Particle = { x: number; y: number; l: number; ci: number };
type Engine = { regenerate: () => void; exportPNG: () => void };

const FF_CSS = `
.ff-root{position:relative;width:100%;height:100%;overflow:hidden;background:#04090f;font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}
.ff-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;}
.ff-hint{position:absolute;top:14px;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:0.32em;color:rgba(255,255,255,0.32);white-space:nowrap;pointer-events:none;user-select:none;}
.ff-bar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;max-width:calc(100% - 20px);padding:10px 16px;border-radius:16px;background:rgba(8,12,20,0.55);border:1px solid rgba(255,255,255,0.09);backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);box-shadow:0 14px 44px rgba(0,0,0,0.5);color:rgba(255,255,255,0.85);}
.ff-title{display:flex;flex-direction:column;line-height:1.2;}
.ff-title-cn{font-size:15px;font-weight:600;letter-spacing:0.4em;}
.ff-title-en{font-size:9px;font-weight:500;letter-spacing:0.16em;color:rgba(255,255,255,0.38);}
.ff-sep{width:1px;height:24px;background:rgba(255,255,255,0.12);}
.ff-pills{display:flex;gap:6px;}
.ff-pill{appearance:none;font-family:inherit;font-size:12px;padding:4px 11px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;transition:color .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease;white-space:nowrap;}
.ff-pill:hover{color:#fff;border-color:rgba(255,255,255,0.36);}
.ff-pill.ff-on{color:#fff;}
.ff-btn{display:inline-flex;align-items:center;gap:6px;appearance:none;font-family:inherit;font-size:12px;padding:5px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.78);cursor:pointer;transition:color .18s ease,border-color .18s ease,background .18s ease;white-space:nowrap;}
.ff-btn:hover{color:#fff;border-color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.09);}
.ff-btn svg{width:13px;height:13px;}
.ff-field{display:flex;align-items:center;gap:7px;font-size:11px;color:rgba(255,255,255,0.55);white-space:nowrap;user-select:none;}
.ff-range{width:72px;height:14px;cursor:pointer;}
.ff-pill:focus-visible,.ff-btn:focus-visible,.ff-range:focus-visible{outline:1px solid rgba(255,255,255,0.55);outline-offset:2px;}
@media (max-width:640px){.ff-hint{display:none}.ff-title-en{display:none}.ff-sep{display:none}}
`;

export default function FlowField() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });

  const [themeIdx, setThemeIdx] = useState(0);
  const [density, setDensity] = useState(1);
  const [speed, setSpeed] = useState(1);

  const themeRef = useRef(0);
  const densityRef = useRef(1);
  const speedRef = useRef(1);

  useEffect(() => {
    // Synchronizes the canvas particle engine (rAF loop, ResizeObserver,
    // visibilitychange listener) with the DOM; cleanup tears it all down,
    // so StrictMode's double mount is safe.
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 1;
    let h = 1;
    let seed = (Math.random() * 0x7fffffff) | 0;
    let fbm = makeFbm(seed);
    let particles: Particle[] = [];
    let raf = 0;
    let running = false;
    let last = performance.now();
    let t = Math.random() * 100;

    const spawn = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      l: 80 + Math.random() * 320,
      ci: (Math.random() * 8) | 0,
    });

    const targetCount = () =>
      Math.max(300, Math.min(6000, Math.round(((w * h) / 900) * densityRef.current)));

    const syncCount = () => {
      const n = targetCount();
      while (particles.length < n) particles.push(spawn());
      if (particles.length > n) particles.length = n;
    };

    const paintBg = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = themeAt(themeRef.current).bg;
      ctx.fillRect(0, 0, w, h);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBg();
      syncCount();
      for (const p of particles) {
        if (p.x > w || p.y > h) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(2.5, Math.max(0.05, (now - last) / 16.667));
      last = now;
      t += dt * 0.0028;
      const th = themeAt(themeRef.current);
      const spd = speedRef.current;
      syncCount();

      // Translucent background fill fades old segments into silky trails.
      const [r, g, b] = hexToRgb(th.bg);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${r},${g},${b},0.035)`;
      ctx.fillRect(0, 0, w, h);

      const s = 0.0022;
      const nc = th.colors.length;
      const paths: Path2D[] = [];
      for (let i = 0; i < nc; i++) paths.push(new Path2D());

      const ptr = pointerRef.current;
      for (const p of particles) {
        const ang = fbm(p.x * s + t, p.y * s - t * 0.7) * Math.PI * 4;
        let vx = Math.cos(ang);
        let vy = Math.sin(ang);
        if (ptr.active) {
          // Local vortex: tangential swirl plus a slight inward pull.
          const dx = p.x - ptr.x;
          const dy = p.y - ptr.y;
          const rr = 170;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const fall = (1 - d / rr) * (1 - d / rr) * 4;
            vx += (-dy / d) * fall - (dx / d) * fall * 0.18;
            vy += (dx / d) * fall - (dy / d) * fall * 0.18;
          }
        }
        const step = 1.5 * spd * dt;
        const nx = p.x + vx * step;
        const ny = p.y + vy * step;
        const path = paths[p.ci % nc] as Path2D;
        path.moveTo(p.x, p.y);
        path.lineTo(nx, ny);
        p.x = nx;
        p.y = ny;
        p.l -= dt;
        if (p.l <= 0 || nx < -12 || ny < -12 || nx > w + 12 || ny > h + 12) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.l = 80 + Math.random() * 320;
        }
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.8;
      ctx.lineCap = "round";
      for (let i = 0; i < nc; i++) {
        ctx.strokeStyle = th.colors[i] as string;
        ctx.stroke(paths[i] as Path2D);
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    document.addEventListener("visibilitychange", onVisibility);
    start();

    engineRef.current = {
      regenerate: () => {
        seed = (Math.random() * 0x7fffffff) | 0;
        fbm = makeFbm(seed);
        t = Math.random() * 100;
        particles = [];
        syncCount();
        paintBg();
      },
      exportPNG: () => {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = `flowfield-${seed}.png`;
        link.click();
      },
    };

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      engineRef.current = null;
    };
  }, []);

  const selectTheme = (i: number) => {
    themeRef.current = i;
    setThemeIdx(i);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported: swirl still works while pressed
    }
    const rect = el.getBoundingClientRect();
    const ptr = pointerRef.current;
    ptr.active = true;
    ptr.x = e.clientX - rect.left;
    ptr.y = e.clientY - rect.top;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ptr = pointerRef.current;
    if (!ptr.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    ptr.x = e.clientX - rect.left;
    ptr.y = e.clientY - rect.top;
  };

  const releasePointer = () => {
    pointerRef.current.active = false;
  };

  const th = themeAt(themeIdx);

  return (
    <div ref={wrapRef} className="ff-root">
      <style>{FF_CSS}</style>
      <canvas
        ref={canvasRef}
        className="ff-canvas"
        aria-label="流场画布：按住拖动以搅动涡旋"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
      />
      <div className="ff-hint">按住拖动 · 搅动涡旋</div>
      <div className="ff-bar" role="toolbar" aria-label="流场控制">
        <div className="ff-title">
          <span className="ff-title-cn">流场</span>
          <span className="ff-title-en">FLOW FIELD · GENERATIVE</span>
        </div>
        <div className="ff-sep" aria-hidden="true" />
        <div className="ff-pills" role="group" aria-label="配色主题">
          {THEMES.map((tm, i) => (
            <button
              key={tm.name}
              type="button"
              className={"ff-pill" + (i === themeIdx ? " ff-on" : "")}
              style={
                i === themeIdx
                  ? {
                      borderColor: tm.accent,
                      background: `${tm.accent}1f`,
                      boxShadow: `0 0 12px ${tm.accent}44`,
                    }
                  : undefined
              }
              aria-pressed={i === themeIdx}
              onClick={() => selectTheme(i)}
            >
              {tm.name}
            </button>
          ))}
        </div>
        <div className="ff-sep" aria-hidden="true" />
        <label className="ff-field">
          密度
          <input
            type="range"
            className="ff-range"
            min={0.4}
            max={2}
            step={0.05}
            value={density}
            style={{ accentColor: th.accent }}
            aria-label="粒子密度"
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              densityRef.current = v;
              setDensity(v);
            }}
          />
        </label>
        <label className="ff-field">
          流速
          <input
            type="range"
            className="ff-range"
            min={0.3}
            max={2.4}
            step={0.05}
            value={speed}
            style={{ accentColor: th.accent }}
            aria-label="流动速度"
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              speedRef.current = v;
              setSpeed(v);
            }}
          />
        </label>
        <div className="ff-sep" aria-hidden="true" />
        <button type="button" className="ff-btn" onClick={() => engineRef.current?.regenerate()}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          重新生成
        </button>
        <button type="button" className="ff-btn" onClick={() => engineRef.current?.exportPNG()}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          导出 PNG
        </button>
      </div>
    </div>
  );
}
