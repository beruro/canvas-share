# 画布集 · Canvas Gallery

三个可玩的交互式画布，部署在 GitHub Pages 上，可以直接把链接分享给别人：

- **流场 Flow Field**（`#/flow`）：流场粒子生成艺术，拖动扰动流场，可换配色、导出 PNG
- **画板 Sketch Board**（`#/sketch`）：手绘画板，画笔/橡皮/撤销/导出，画完导图分享
- **弹珠 Physics Toy**（`#/physics`）：物理沙盒玩具，生成彩球、拖拽甩飞

> 三个变体由三个 AI 子代理并行独立设计，外壳画廊统一承载，hash 路由可直达单个画布。

## 本地开发

```bash
npm install
npm run dev
```

## 部署

```bash
npm run deploy
```

构建后推送 `dist/` 到 `gh-pages` 分支，GitHub Pages 自动发布。

## 技术栈

Vite + React 18 + TypeScript，零运行时依赖（每个画布变体都是单文件、只依赖 React 的自包含组件）。
