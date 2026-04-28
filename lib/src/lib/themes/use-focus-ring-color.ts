import { useEffect, useState } from 'react';

function readFocusRingColor(): string {
  return getComputedStyle(document.body).getPropertyValue('--color-focus-ring').trim();
}

/** Resolved value of --color-focus-ring. Re-reads when body class/style changes
 *  (Pond.useDynamicPalette publishes the var by writing to body.style). */
export function useFocusRingColor(): string {
  const [color, setColor] = useState(readFocusRingColor);

  useEffect(() => {
    const mo = new MutationObserver(() => {
      const next = readFocusRingColor();
      setColor((prev) => (prev === next ? prev : next));
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => mo.disconnect();
  }, []);

  return color;
}
