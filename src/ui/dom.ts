/**
 * Tiny DOM helpers. Not a framework — the UI is a few dozen elements built once
 * at boot and mutated in place (SPEC §11.3).
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (parent !== undefined) parent.appendChild(node);
  return node;
}

export function button(label: string, className: string, parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', className, parent);
  b.type = 'button';
  b.textContent = label;
  return b;
}

/**
 * Sets textContent only when it actually changed.
 *
 * Writing the same string still dirties the node and can force a layout; the
 * HUD updates every frame, so this guard is the difference between free and
 * measurable (CLAUDE.md §9).
 */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Sets a CSS custom property only when it changed. */
export function setVar(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

export function setClass(node: HTMLElement, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

export function show(node: HTMLElement, visible: boolean): void {
  if (node.hidden === !visible) return;
  node.hidden = !visible;
}
