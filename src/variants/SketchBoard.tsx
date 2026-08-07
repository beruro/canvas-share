import { useEffect, useRef, useState } from "react";

type StrokePoint = { x: number; y: number; w: number };
type Stroke = { color: string; size: number; eraser: boolean; points: StrokePoint[] };

const PAPER = "#f6f1e7";
const PALETTE = [
  { name: "墨黑", value: "#2b2620" },
  { name: "朱红", value: "#c2452d" },
  { name: "藤黄", value: "#d9a441" },
  { name: "松绿", value: "#3d7a55" },
  { name: "黛蓝", value: "#2d5a8e" },
  { name: "紫苏", value: "#7b5ea7" },
  { name: "胭脂", value: "#c26d8d" },
  { name: "云灰", value: "#9a938a" },
];

function makeNoiseTile(): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 96;
  tile.height = 96;
  const ctx = tile.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 60 + Math.floor(Math.random() * 120);
      img.data[i] = v;
      img.data[i + 1] = v - 8;
      img.data[i + 2] = v - 18;
      img.data[i + 3] = Math.random() < 0.5 ? 10 : 4;
    }
    ctx.putImageData(img, 0, 0);
  }
  return tile;
}

function midpoint(a: StrokePoint, b: StrokePoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  p0: StrokePoint,
  p1: StrokePoint,
  p2: StrokePoint,
  stroke: Stroke,
) {
  ctx.save();
  ctx.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.5, p1.w);
  const m1 = midpoint(p0, p1);
  const m2 = midpoint(p1, p2);
  ctx.beginPath();
  ctx.moveTo(m1.x, m1.y);
  ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
  ctx.stroke();
  ctx.restore();
}

function drawWholeStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  if (pts.length < 3) {
    const p = pts[0];
    ctx.save();
    ctx.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
    ctx.fillStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.w / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    drawStrokeSegment(ctx, pts[i - 1], pts[i], pts[i + 1], stroke);
  }
}

export default function SketchBoard() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noiseRef = useRef<HTMLCanvasElement | null>(null);
  const noiseUrlRef = useRef<string>("");

  // 历史 = 笔画数组快照栈，撤销/重做只移动指针并从模型重绘
  const historyRef = useRef<{ stack: Stroke[][]; index: number }>({ stack: [[]], index: 0 });
  const liveStrokeRef = useRef<Stroke | null>(null);
  const lastRef = useRef<{ x: number; y: number; w: number; t: number } | null>(null);

  const [color, setColor] = useState(PALETTE[0].value);
  const [size, setSize] = useState(6);
  const [eraser, setEraser] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const eraserRef = useRef(eraser);
  colorRef.current = color;
  sizeRef.current = size;
  eraserRef.current = eraser;

  function syncHistoryButtons() {
    const h = historyRef.current;
    setCanUndo(h.index > 0);
    setCanRedo(h.index < h.stack.length - 1);
  }

  function redrawAll() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const h = historyRef.current;
    for (const stroke of h.stack[h.index]) drawWholeStroke(ctx, stroke);
  }

  function commit(nextStrokes: Stroke[]) {
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(nextStrokes);
    if (h.stack.length > 60) h.stack.shift();
    h.index = h.stack.length - 1;
    syncHistoryButtons();
  }

  // 同步外部系统：canvas 尺寸(DPR/ResizeObserver)与全局 pointer 结束事件
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    if (!noiseRef.current) {
      noiseRef.current = makeNoiseTile();
      noiseUrlRef.current = noiseRef.current.toDataURL();
      wrap.style.setProperty("--sb-noise", `url(${noiseUrlRef.current})`);
    }

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      redrawAll();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!e.isPrimary) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointFromEvent(e);
    const base = eraserRef.current ? sizeRef.current * 2.6 : sizeRef.current;
    const stroke: Stroke = {
      color: colorRef.current,
      size: sizeRef.current,
      eraser: eraserRef.current,
      points: [{ x, y, w: base }],
    };
    liveStrokeRef.current = stroke;
    lastRef.current = { x, y, w: base, t: e.timeStamp };
    setConfirmClear(false);
  }

  function onPointerMove(e: React.PointerEvent) {
    const stroke = liveStrokeRef.current;
    const last = lastRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!stroke || !last || !ctx) return;
    const { x, y } = pointFromEvent(e);
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist < 1.2) return;
    const base = stroke.eraser ? stroke.size * 2.6 : stroke.size;
    // 速度越快笔触越细，模拟书写质感；橡皮保持恒定宽度
    const target = stroke.eraser ? base : base * Math.min(1.35, Math.max(0.35, 1.35 - dist / 46));
    const w = last.w * 0.65 + target * 0.35;
    stroke.points.push({ x, y, w });
    const n = stroke.points.length;
    if (n >= 3) {
      drawStrokeSegment(ctx, stroke.points[n - 3], stroke.points[n - 2], stroke.points[n - 1], stroke);
    }
    lastRef.current = { x, y, w, t: e.timeStamp };
  }

  function onPointerUp() {
    const stroke = liveStrokeRef.current;
    if (!stroke) return;
    liveStrokeRef.current = null;
    lastRef.current = null;
    if (stroke.points.length === 0) return;
    const h = historyRef.current;
    commit([...h.stack[h.index], stroke]);
    redrawAll();
  }

  function undo() {
    const h = historyRef.current;
    if (h.index > 0) {
      h.index--;
      syncHistoryButtons();
      redrawAll();
    }
  }

  function redo() {
    const h = historyRef.current;
    if (h.index < h.stack.length - 1) {
      h.index++;
      syncHistoryButtons();
      redrawAll();
    }
  }

  function clearBoard() {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 2600);
      return;
    }
    setConfirmClear(false);
    commit([]);
    redrawAll();
  }

  function exportPNG() {
    const canvas = canvasRef.current;
    const noise = noiseRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, out.width, out.height);
    if (noise) {
      const pattern = ctx.createPattern(noise, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, out.width, out.height);
      }
    }
    ctx.drawImage(canvas, 0, 0);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `素笺画板-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    a.click();
  }

  return (
    <div ref={wrapRef} className="sb-root">
      <style>{`
        .sb-root { position: relative; width: 100%; height: 100%; background: ${PAPER}; overflow: hidden; }
        .sb-root::before { content: ""; position: absolute; inset: 0; background-image: var(--sb-noise); pointer-events: none; }
        .sb-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
        .sb-title { position: absolute; top: 18px; left: 22px; pointer-events: none; user-select: none; }
        .sb-title strong { display: block; font-size: 17px; letter-spacing: 0.14em; color: #4a4235; font-weight: 600; }
        .sb-title span { display: block; margin-top: 3px; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #a89c88; }
        .sb-dock { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 24px); padding: 10px 14px; background: rgba(255, 253, 247, 0.92); border: 1px solid #e2d8c4; border-radius: 16px; box-shadow: 0 6px 24px rgba(74, 66, 53, 0.10); }
        .sb-swatches { display: flex; gap: 7px; }
        .sb-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; outline-offset: 2px; transition: transform .12s ease; }
        .sb-swatch:hover { transform: scale(1.15); }
        .sb-swatch.sb-active { border-color: #fffdf7; outline: 2px solid #4a4235; }
        .sb-sep { width: 1px; height: 22px; background: #e2d8c4; }
        .sb-group { display: flex; align-items: center; gap: 8px; }
        .sb-size { accent-color: #4a4235; width: 84px; }
        .sb-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #d8cdb6; background: #fffdf7; color: #4a4235; font-size: 12px; font-family: inherit; padding: 6px 10px; border-radius: 10px; cursor: pointer; transition: background .12s ease; white-space: nowrap; }
        .sb-btn:hover:not(:disabled) { background: #f1e9d8; }
        .sb-btn:disabled { opacity: 0.38; cursor: default; }
        .sb-btn.sb-on { background: #4a4235; color: #f6f1e7; border-color: #4a4235; }
        .sb-btn.sb-danger { border-color: #c2452d; color: #c2452d; }
        .sb-btn.sb-danger.sb-on, .sb-btn.sb-danger:hover:not(:disabled) { background: #c2452d; color: #fffdf7; }
        @media (max-width: 640px) {
          .sb-dock { gap: 8px; padding: 8px 10px; border-radius: 14px; bottom: 10px; }
          .sb-size { width: 64px; }
          .sb-title { top: 12px; left: 14px; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        className="sb-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="sb-title">
        <strong>素笺 · 手绘画板</strong>
        <span>Sketch Board</span>
      </div>
      <div className="sb-dock">
        <div className="sb-swatches">
          {PALETTE.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`sb-swatch${!eraser && color === c.value ? " sb-active" : ""}`}
              style={{ background: c.value }}
              title={c.name}
              aria-label={`颜色 ${c.name}`}
              onClick={() => {
                setColor(c.value);
                setEraser(false);
              }}
            />
          ))}
        </div>
        <div className="sb-sep" />
        <div className="sb-group">
          <input
            type="range"
            className="sb-size"
            min={2}
            max={26}
            step={1}
            value={size}
            aria-label="笔刷大小"
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button
            type="button"
            className={`sb-btn${eraser ? " sb-on" : ""}`}
            onClick={() => setEraser((v) => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 15 13 6l5 5-9 9H6z" />
              <path d="M9 20h11" />
            </svg>
            橡皮
          </button>
        </div>
        <div className="sb-sep" />
        <div className="sb-group">
          <button type="button" className="sb-btn" disabled={!canUndo} onClick={undo}>
            撤销
          </button>
          <button type="button" className="sb-btn" disabled={!canRedo} onClick={redo}>
            重做
          </button>
          <button
            type="button"
            className={`sb-btn sb-danger${confirmClear ? " sb-on" : ""}`}
            onClick={clearBoard}
          >
            {confirmClear ? "确认清空？" : "清空"}
          </button>
          <button type="button" className="sb-btn" onClick={exportPNG}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M4 17v3h16v-3" />
            </svg>
            导出 PNG
          </button>
        </div>
      </div>
    </div>
  );
}
