/**
 * Prompt templates use {{variable}} placeholders:
 *   "Summarise this ticket in one sentence: {{ticket}}"
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Names of the variables a template uses, without duplicates. */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Variables the template needs but `values` doesn't provide. */
export function missingVariables(template: string, values: Record<string, string>): string[] {
  return placeholders(template).filter((name) => !(name in values));
}

/**
 * Fills in the placeholders. Throws if any is missing: sending Claude a
 * literal "{{ticket}}" would waste money and produce a meaningless result.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const missing = missingVariables(template, values);
  if (missing.length > 0) throw new Error(`Missing template variables: ${missing.join(', ')}`);
  // A replacer function (not a string) so "$&" or "$1" inside values stay literal.
  return template.replace(PLACEHOLDER, (_match, name: string) => values[name]);
}
