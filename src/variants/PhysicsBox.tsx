import { useEffect, useRef, useState } from "react";

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  born: number;
};

type GravityMode = "normal" | "float" | "vortex";

const COLORS = ["#ff5c4d", "#ffb020", "#2fb573", "#2e8de6", "#8e5ce0", "#f36f9a"];
const MAX_BALLS = 200;
const MODES: { id: GravityMode; label: string }[] = [
  { id: "normal", label: "重力" },
  { id: "float", label: "漂浮" },
  { id: "vortex", label: "漩涡" },
];

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

export default function PhysicsBox() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const modeRef = useRef<GravityMode>("normal");
  const sizeRef = useRef({ w: 0, h: 0 });
  const grabRef = useRef<{
    ball: Ball;
    samples: { x: number; y: number; t: number }[];
  } | null>(null);
  const pressRef = useRef<{ x: number; y: number; holding: boolean; lastSpawn: number } | null>(null);

  const [mode, setMode] = useState<GravityMode>("normal");
  const [count, setCount] = useState(0);
  modeRef.current = mode;

  function spawnBall(x: number, y: number, now: number) {
    const balls = ballsRef.current;
    const r = 10 + Math.random() * 22;
    balls.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 260,
      vy: (Math.random() - 0.5) * 160,
      r,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      born: now,
    });
    if (balls.length > MAX_BALLS) balls.shift();
    setCount(balls.length);
  }

  // 同步外部系统：canvas 渲染循环(rAF)、尺寸(ResizeObserver)、页面可见性
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    let raf = 0;
    let running = true;
    let last = performance.now();

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const step = (dt: number, now: number) => {
      const { w, h } = sizeRef.current;
      const balls = ballsRef.current;
      const m = modeRef.current;
      const grabbed = grabRef.current?.ball ?? null;

      // 按住空白处连续生成
      const press = pressRef.current;
      if (press && press.holding && now - press.lastSpawn > 90) {
        press.lastSpawn = now;
        spawnBall(press.x, press.y, now);
      }

      for (const b of balls) {
        if (b === grabbed) continue;
        if (m === "normal") {
          b.vy += 1750 * dt;
          b.vx *= 0.999;
        } else if (m === "float") {
          b.vx *= 0.9985;
          b.vy *= 0.9985;
        } else {
          const cx = w / 2;
          const cy = h / 2;
          const dx = cx - b.x;
          const dy = cy - b.y;
          const d = Math.max(40, Math.hypot(dx, dy));
          b.vx += ((dx / d) * 950 - (dy / d) * 420) * dt;
          b.vy += ((dy / d) * 950 + (dx / d) * 420) * dt;
          b.vx *= 0.995;
          b.vy *= 0.995;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }

      // 迭代碰撞求解：位置分离 + 法向冲量
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const min = a.r + b.r;
            if (dist >= min || dist === 0) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = min - dist;
            const ma = a.r * a.r;
            const mb = b.r * b.r;
            const total = ma + mb;
            if (a !== grabbed) {
              a.x -= nx * overlap * (mb / total);
              a.y -= ny * overlap * (mb / total);
            }
            if (b !== grabbed) {
              b.x += nx * overlap * (ma / total);
              b.y += ny * overlap * (ma / total);
            }
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn < 0) {
              const e = 0.84;
              const impulse = (-(1 + e) * vn) / (1 / ma + 1 / mb);
              if (a !== grabbed) {
                a.vx -= (impulse * nx) / ma;
                a.vy -= (impulse * ny) / ma;
              }
              if (b !== grabbed) {
                b.vx += (impulse * nx) / mb;
                b.vy += (impulse * ny) / mb;
              }
            }
          }
        }
        for (const b of balls) {
          if (b === grabbed) continue;
          if (b.x - b.r < 0) {
            b.x = b.r;
            b.vx = Math.abs(b.vx) * 0.82;
          } else if (b.x + b.r > w) {
            b.x = w - b.r;
            b.vx = -Math.abs(b.vx) * 0.82;
          }
          if (b.y - b.r < 0) {
            b.y = b.r;
            b.vy = Math.abs(b.vy) * 0.82;
          } else if (b.y + b.r > h) {
            b.y = h - b.r;
            b.vy = -Math.abs(b.vy) * 0.82;
            b.vx *= 0.985;
          }
        }
      }
    };

    const render = (now: number) => {
      const { w, h } = sizeRef.current;
      const balls = ballsRef.current;
      ctx.clearRect(0, 0, w, h);

      if (balls.length === 0) {
        ctx.save();
        ctx.fillStyle = "#b8ab93";
        ctx.font = "13px -apple-system, 'PingFang SC', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("点击或按住任意处，生成弹珠 · 拖住弹珠甩出去", w / 2, h / 2);
        ctx.restore();
      }

      for (const b of balls) {
        const pop = Math.min(1, (now - b.born) / 220);
        const r = b.r * (0.6 + 0.4 * pop);
        const g = ctx.createRadialGradient(
          b.x - r * 0.35,
          b.y - r * 0.42,
          r * 0.12,
          b.x,
          b.y,
          r,
        );
        g.addColorStop(0, shade(b.color, 70));
        g.addColorStop(0.55, b.color);
        g.addColorStop(1, shade(b.color, -38));
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x - r * 0.32, b.y - r * 0.4, r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      // dt 钳制：后台切回或掉帧时物理不发散
      const dt = Math.min(1 / 30, Math.max(0.0001, (now - last) / 1000));
      last = now;
      step(dt, now);
      render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!e.isPrimary) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    const balls = ballsRef.current;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 6) {
        grabRef.current = { ball: b, samples: [{ x, y, t: e.timeStamp }] };
        b.vx = 0;
        b.vy = 0;
        return;
      }
    }
    const now = performance.now();
    pressRef.current = { x, y, holding: true, lastSpawn: now };
    spawnBall(x, y, now);
  }

  function onPointerMove(e: React.PointerEvent) {
    const { x, y } = pos(e);
    const grab = grabRef.current;
    if (grab) {
      grab.ball.x = x;
      grab.ball.y = y;
      grab.samples.push({ x, y, t: e.timeStamp });
      if (grab.samples.length > 6) grab.samples.shift();
      return;
    }
    const press = pressRef.current;
    if (press && press.holding) {
      press.x = x;
      press.y = y;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const grab = grabRef.current;
    if (grab) {
      const s = grab.samples;
      if (s.length >= 2) {
        const a = s[0];
        const b = s[s.length - 1];
        const dt = Math.max(0.016, (b.t - a.t) / 1000);
        // 松手继承拖拽速度（限幅防止穿模）
        grab.ball.vx = Math.max(-2600, Math.min(2600, (b.x - a.x) / dt));
        grab.ball.vy = Math.max(-2600, Math.min(2600, (b.y - a.y) / dt));
      }
      grabRef.current = null;
    }
    pressRef.current = null;
    void e;
  }

  function clearAll() {
    ballsRef.current = [];
    grabRef.current = null;
    setCount(0);
  }

  return (
    <div ref={wrapRef} className="pb-root">
      <style>{`
        .pb-root { position: relative; width: 100%; height: 100%; background: #f3ede3; overflow: hidden; }
        .pb-canvas { position: absolute; inset: 0; touch-action: none; cursor: pointer; }
        .pb-title { position: absolute; top: 18px; left: 22px; pointer-events: none; user-select: none; }
        .pb-title strong { display: block; font-size: 17px; letter-spacing: 0.14em; color: #4a4235; font-weight: 600; }
        .pb-title span { display: block; margin-top: 3px; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #b3a68e; }
        .pb-panel { position: absolute; right: 16px; top: 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 32px); }
        .pb-modes { display: flex; background: #fffdf7; border: 1px solid #e2d8c4; border-radius: 12px; padding: 3px; box-shadow: 0 4px 16px rgba(74, 66, 53, 0.08); }
        .pb-mode { border: none; background: transparent; color: #8a7f6a; font-family: inherit; font-size: 12px; padding: 6px 13px; border-radius: 9px; cursor: pointer; transition: all .14s ease; }
        .pb-mode.pb-active { background: #4a4235; color: #f6f1e7; }
        .pb-count { font-size: 12px; color: #8a7f6a; background: #fffdf7; border: 1px solid #e2d8c4; border-radius: 12px; padding: 7px 12px; min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
        .pb-clear { border: 1px solid #e2d8c4; background: #fffdf7; color: #c2452d; font-family: inherit; font-size: 12px; padding: 7px 13px; border-radius: 12px; cursor: pointer; transition: all .14s ease; }
        .pb-clear:hover { background: #c2452d; border-color: #c2452d; color: #fffdf7; }
        @media (max-width: 640px) {
          .pb-panel { right: 10px; top: 10px; gap: 6px; }
          .pb-title { top: 12px; left: 14px; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        className="pb-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="pb-title">
        <strong>弹坊 · 物理沙盒</strong>
        <span>Physics Toy</span>
      </div>
      <div className="pb-panel">
        <div className="pb-modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pb-mode${mode === m.id ? " pb-active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="pb-count">× {count}</div>
        <button type="button" className="pb-clear" onClick={clearAll}>
          清空
        </button>
      </div>
    </div>
  );
}
