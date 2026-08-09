import { useState } from "react";

type A2UIElement = Record<string, unknown> & { type?: string };

function parseElements(content: string): A2UIElement[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return value && typeof value === "object"
          ? (value as A2UIElement)
          : { type: "text", content: line };
      } catch {
        return { type: "text", content: line };
      }
    });
}

function inlineStyle(value: unknown): React.CSSProperties | undefined {
  if (typeof value !== "string") return undefined;
  const style: Record<string, string> = {};
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (!property || !propertyValue) continue;
    style[property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] =
      propertyValue;
  }
  return style;
}

function A2UIForm({ element }: { element: A2UIElement }) {
  const fields = Array.isArray(element.fields)
    ? (element.fields as Array<Record<string, unknown>>)
    : [];
  const [submitted, setSubmitted] = useState(false);
  return (
    <form
      className="a2ui-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      {fields.map((field, index) => (
        <label key={`${String(field.name)}-${index}`}>
          <span>{String(field.label ?? field.name ?? "Field")}</span>
          {field.inputType === "select" ? (
            <select defaultValue={String(field.defaultValue ?? "")}>
              {(Array.isArray(field.options) ? field.options : []).map(
                (option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                )
              )}
            </select>
          ) : (
            <input
              type={field.inputType === "checkbox" ? "checkbox" : "text"}
              defaultValue={
                field.inputType === "checkbox"
                  ? undefined
                  : String(field.defaultValue ?? "")
              }
              defaultChecked={
                field.inputType === "checkbox"
                  ? field.defaultValue === "true"
                  : undefined
              }
            />
          )}
        </label>
      ))}
      <button type="submit">{String(element.submitLabel ?? "Submit")}</button>
      {submitted ? (
        <span className="a2ui-local-note">
          Preview only — nothing was sent.
        </span>
      ) : null}
    </form>
  );
}

function A2UIButton({ element }: { element: A2UIElement }) {
  const [activated, setActivated] = useState(false);
  return (
    <div className="a2ui-local-action">
      <button type="button" onClick={() => setActivated(true)}>
        {String(element.content ?? "Action")}
      </button>
      {activated ? (
        <span className="a2ui-local-note">
          Preview only — nothing was sent.
        </span>
      ) : null}
    </div>
  );
}

function A2UIChart({ element }: { element: A2UIElement }) {
  const data =
    element.data && typeof element.data === "object"
      ? (element.data as Record<string, unknown>)
      : {};
  const labels = Array.isArray(data.labels) ? data.labels : [];
  const datasets = Array.isArray(data.datasets)
    ? (data.datasets as Array<Record<string, unknown>>)
    : [];
  return (
    <div className="a2ui-chart">
      {element.title ? <strong>{String(element.title)}</strong> : null}
      <div className="a2ui-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              {datasets.map((dataset, index) => (
                <th key={`${String(dataset.label)}-${index}`}>
                  {String(dataset.label ?? `Series ${index + 1}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, labelIndex) => (
              <tr key={`${String(label)}-${labelIndex}`}>
                <td>{String(label)}</td>
                {datasets.map((dataset, datasetIndex) => {
                  const values = Array.isArray(dataset.values)
                    ? dataset.values
                    : [];
                  return (
                    <td key={datasetIndex}>
                      {String(values[labelIndex] ?? 0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderElement(element: A2UIElement, index: number) {
  const content = String(element.content ?? "");
  const style = inlineStyle(element.style);
  switch (element.type) {
    case "heading":
      return (
        <h2 key={index} style={style}>
          {content}
        </h2>
      );
    case "code":
      return (
        <pre key={index} style={style}>
          <code>{content}</code>
        </pre>
      );
    case "image":
      return <img key={index} style={style} src={content} alt="" />;
    case "button":
      return <A2UIButton key={index} element={element} />;
    case "divider":
      return <hr key={index} />;
    case "list":
      return (
        <ul key={index} style={style}>
          {(Array.isArray(element.items) ? element.items : []).map((item) => (
            <li key={String(item)}>{String(item)}</li>
          ))}
        </ul>
      );
    case "table": {
      const headers = Array.isArray(element.headers) ? element.headers : [];
      const rows = Array.isArray(element.rows) ? element.rows : [];
      return (
        <div className="a2ui-table-wrap" key={index}>
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={String(header)}>{String(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {(Array.isArray(row) ? row : []).map((cell, cellIndex) => (
                    <td key={cellIndex}>{String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "form":
      return <A2UIForm key={index} element={element} />;
    case "chart":
      return <A2UIChart key={index} element={element} />;
    case "html":
      return (
        <iframe
          key={index}
          className="a2ui-html-frame"
          title="Shared A2UI HTML"
          style={style}
          srcDoc={`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent;color:#dfe3eb;font:14px/1.55 system-ui,-apple-system,sans-serif}a{color:#a78bfa}img{max-width:100%}</style>${content}`}
          sandbox=""
        />
      );
    default:
      return (
        <p key={index} style={style}>
          {content}
        </p>
      );
  }
}

export default function SharedA2UICanvas({ content }: { content: string }) {
  return (
    <div className="a2ui-stage">
      {parseElements(content).map(renderElement)}
    </div>
  );
}
