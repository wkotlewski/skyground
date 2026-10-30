/** Small DOM helper. Text always goes in as text nodes, never as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | undefined> = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }
  return node;
}

export function button(label: string, props: Record<string, string | boolean | undefined> = {}, onClick?: () => void): HTMLButtonElement {
  const node = h('button', { type: 'button', ...props }, label);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function fmt(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function latLonText(point: { lat: number; lon: number }): string {
  const lat = `${Math.abs(point.lat).toFixed(1)}°${point.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(point.lon).toFixed(1)}°${point.lon >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

export function safeHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
