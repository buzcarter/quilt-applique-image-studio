/**
 * Renders a <template> element by cloning its content and replacing
 * {{TOKEN}} placeholders in the resulting HTML string.
 *
 * Returns the first element child of the rendered fragment.
 * Token values are inserted verbatim — callers are responsible for
 * passing safe strings (HTML snippets are intentional and supported).
 */
export function renderTemplate(templateId, tokens = {}) {
  const tpl = document.getElementById(templateId);
  if (!tpl) throw new Error(`Template not found: #${templateId}`);

  let html = tpl.innerHTML;
  for (const [key, val] of Object.entries(tokens)) {
    html = html.replaceAll(`{{${key}}}`, val == null ? '' : String(val));
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild;
}
