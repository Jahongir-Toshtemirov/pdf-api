type TemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TemplateValue[]
  | { [key: string]: TemplateValue };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPath(data: TemplateValue, path: string): TemplateValue {
  const trimmed = path.trim();
  if (trimmed === ".") {
    return typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "." in data
      ? (data as { [key: string]: TemplateValue })["."]
      : data;
  }

  const parts = trimmed.split(".").filter(Boolean);
  let current: TemplateValue = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[part];
  }

  return current;
}

function formatValue(value: TemplateValue, raw: boolean): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    return raw ? JSON.stringify(value) : escapeHtml(JSON.stringify(value));
  }
  const str = String(value);
  return raw ? str : escapeHtml(str);
}

function isTruthy(value: TemplateValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/**
 * Lightweight mustache-style renderer supporting:
 * - {{variable}} / {{nested.path}}
 * - {{{rawHtml}}}
 * - {{#section}}...{{/section}} (truthy / arrays)
 * - {{^section}}...{{/section}} (falsy)
 */
export function renderTemplate(
  template: string,
  data: Record<string, TemplateValue>,
): string {
  let result = template;

  // Sections with arrays / conditionals (non-greedy, nested-safe via recursion)
  const sectionRegex =
    /\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;

  result = result.replace(sectionRegex, (_match, type, key, content) => {
    const value = getPath(data, key);

    if (type === "#") {
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            const scope =
              item !== null && typeof item === "object" && !Array.isArray(item)
                ? { ...data, ...(item as Record<string, TemplateValue>), ".": item }
                : { ...data, ".": item };
            return renderTemplate(content, scope);
          })
          .join("");
      }
      if (isTruthy(value)) {
        const scope =
          value !== null && typeof value === "object" && !Array.isArray(value)
            ? { ...data, ...(value as Record<string, TemplateValue>) }
            : data;
        return renderTemplate(content, scope);
      }
      return "";
    }

    // inverted section
    return isTruthy(value) ? "" : renderTemplate(content, data);
  });

  // Triple-stash (unescaped)
  result = result.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key) =>
    formatValue(getPath(data, key), true),
  );

  // Double-stash (escaped)
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) =>
    formatValue(getPath(data, key), false),
  );

  return result;
}
