import { useMemo } from "react";
import { transform } from "sucrase";

import reactDomRuntime from "../node_modules/react-dom/umd/react-dom.production.min.js?raw";
import reactRuntime from "../node_modules/react/umd/react.production.min.js?raw";

export function normalizeReactSource(source: string): string {
  let code = source.replace(
    /^\s*import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];?\s*$/gm,
    ""
  );
  code = code.replace(
    /^\s*import\s+\{[^}]*\}\s+from\s+["']react["'];?\s*$/gm,
    ""
  );

  if (/\bexport\s+default\s+function\s+App\s*\(/.test(code)) {
    code = code.replace(
      /\bexport\s+default\s+function\s+App\s*\(/,
      "function App("
    );
    return `${code}\nrender(<App />);`;
  }
  if (/\bexport\s+default\s+function\s*\(/.test(code)) {
    code = code.replace(/\bexport\s+default\s+function\s*\(/, "function App(");
    return `${code}\nrender(<App />);`;
  }

  const namedDefaultMatch = code.match(
    /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/
  );
  if (namedDefaultMatch) {
    code = code.replace(namedDefaultMatch[0], "");
    return `${code}\nrender(<${namedDefaultMatch[1]} />);`;
  }
  if (/\bexport\s+default\s+/.test(code)) {
    code = code.replace(/\bexport\s+default\s+/, "const App = ");
    return `${code}\nrender(<App />);`;
  }
  if (/\bfunction\s+App\s*\(|\bconst\s+App\s*=|\blet\s+App\s*=/.test(code)) {
    return `${code}\nrender(<App />);`;
  }
  return code;
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

function buildReactSandboxDocument(source: string): string {
  const compiled = transform(normalizeReactSource(source), {
    transforms: ["typescript", "jsx"],
    production: true,
  }).code;
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; media-src data: blob: https:; font-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<style>*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;width:100%}body{background:#0b0d12;color:#f2f4f8;font-family:system-ui,-apple-system,sans-serif}#error{display:none;margin:16px;padding:12px;border:1px solid rgba(248,113,113,.35);border-radius:8px;background:rgba(127,29,29,.16);color:#fecaca;white-space:pre-wrap;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}</style>
</head><body><div id="root"></div><pre id="error"></pre>
<script>${escapeInlineScript(reactRuntime)}</script>
<script>${escapeInlineScript(reactDomRuntime)}</script>
<script>const errorElement=document.getElementById('error');function showError(error){errorElement.style.display='block';errorElement.textContent=error&&error.stack?error.stack:String(error)}window.addEventListener('error',event=>showError(event.error||event.message));window.addEventListener('unhandledrejection',event=>showError(event.reason));try{const root=ReactDOM.createRoot(document.getElementById('root'));const render=element=>root.render(element);${escapeInlineScript(compiled)}}catch(error){showError(error)}</script>
</body></html>`;
}

export default function SharedReactCanvas({ source }: { source: string }) {
  const document = useMemo(() => buildReactSandboxDocument(source), [source]);
  return (
    <iframe
      className="shared-runtime-frame"
      title="Shared React Canvas"
      srcDoc={document}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
    />
  );
}
