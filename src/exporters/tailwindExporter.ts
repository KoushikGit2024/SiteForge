/**
 * Utility to export an inspected DOM element's layout and computed styles
 * into standard, clean Tailwind CSS utility classes.
 */

export function extractTailwind(el: HTMLElement): string {
  const cs = window.getComputedStyle(el);
  const classes: string[] = [];
  const arbitrary = (prefix: string, value: string): string =>
    `${prefix}-[${value.trim().replace(/\s+/g, '_')}]`;

  // Display
  const d = cs.display;
  if (d === 'flex') {
    classes.push('flex');
    if (cs.flexDirection === 'column') classes.push('flex-col');
    if (cs.alignItems === 'center') classes.push('items-center');
    if (cs.justifyContent === 'center') classes.push('justify-center');
    if (cs.justifyContent === 'space-between') classes.push('justify-between');
  } else if (d === 'grid') {
    classes.push('grid');
  } else if (d === 'inline-block') {
    classes.push('inline-block');
  } else if (d === 'block') {
    classes.push('block');
  }

  // Padding
  const pt = parseFloat(cs.paddingTop) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;
  if (pt === pr && pr === pb && pb === pl && pt > 0) {
    classes.push(`p-[${pt}px]`);
  } else {
    if (pt > 0) classes.push(`pt-[${pt}px]`);
    if (pr > 0) classes.push(`pr-[${pr}px]`);
    if (pb > 0) classes.push(`pb-[${pb}px]`);
    if (pl > 0) classes.push(`pl-[${pl}px]`);
  }

  // Border & Radius
  const radii = [
    cs.borderTopLeftRadius,
    cs.borderTopRightRadius,
    cs.borderBottomRightRadius,
    cs.borderBottomLeftRadius,
  ];
  if (radii.every((radius) => radius === radii[0])) {
    const radius = radii[0];
    if (radius.endsWith('%') && parseFloat(radius) >= 50) classes.push('rounded-full');
    else if (parseFloat(radius) >= 10000) classes.push('rounded-full');
    else if (radius !== '0px') classes.push(arbitrary('rounded', radius));
  } else {
    const corners = ['rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'];
    radii.forEach((radius, index) => {
      if (radius !== '0px') classes.push(arbitrary(corners[index], radius));
    });
  }

  const bw = parseFloat(cs.borderTopWidth) || 0;
  if (bw > 0 && cs.borderTopStyle !== 'none') {
    classes.push(`border-[${bw}px]`);
    if (['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'].includes(cs.borderTopStyle)) {
      classes.push(`border-${cs.borderTopStyle}`);
    } else classes.push(`[border-style:${cs.borderTopStyle}]`);
    classes.push(arbitrary('border', `color:${cs.borderTopColor}`));
  }

  // Background
  const bg = cs.backgroundColor;
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
    classes.push(arbitrary('bg', bg));
  }

  // Color & Typography
  const col = cs.color;
  if (col) classes.push(arbitrary('text', col));

  const fs = parseFloat(cs.fontSize) || 0;
  if (fs > 0) classes.push(`text-[${fs}px]`);

  const fw = parseInt(cs.fontWeight) || 400;
  if (fw >= 700) classes.push('font-bold');
  else if (fw >= 600) classes.push('font-semibold');
  else if (fw >= 500) classes.push('font-medium');

  return classes.join(' ');
}

export function exportCleanHTML(el: HTMLElement, utilityClasses = ''): string {
  const clone = el.cloneNode(true) as HTMLElement;
  if (clone.matches('script')) return '';
  if (utilityClasses) clone.classList.add(...utilityClasses.split(/\s+/).filter(Boolean));
  clone.querySelectorAll('script').forEach((script) => script.remove());
  for (const node of [clone, ...clone.querySelectorAll('*')]) {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
    }
  }
  return clone.outerHTML;
}
