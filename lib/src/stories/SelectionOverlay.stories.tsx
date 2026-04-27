import { useState, useRef, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { PondMode } from '../components/Pond';
import { MarchingAntsRect } from '../components/Pond';

function SelectionOverlayDemo({ initialMode = 'command' as PondMode }) {
  const [mode, setMode] = useState<PondMode>(initialMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 484, height: 284 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width - 16, height: entry.contentRect.height - 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-header-active-bg').trim() || '#094771';

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 8,
    borderRadius: '0.5rem',
    pointerEvents: 'none',
    transition: 'border 150ms, box-shadow 150ms',
  };

  if (mode === 'passthrough') {
    overlayStyle.border = `2px solid ${color}`;
    overlayStyle.boxShadow = `0 0 15px color-mix(in srgb, ${color} 30%, transparent)`;
  }

  return (
    <div ref={containerRef} style={{ width: 500, height: 300 }} className="relative bg-app-bg">
      {/* Simulated terminal content */}
      <div className="p-4 font-mono text-sm text-terminal-fg">
        <div>user@mouseterm:~$ ls -la</div>
        <div>total 48</div>
        <div>drwxr-xr-x  12 user staff  384 Mar 16 10:30 .</div>
      </div>
      {/* Selection overlay */}
      {mode === 'command' ? (
        <div style={{ position: 'absolute', inset: 8, pointerEvents: 'none' }}>
          <MarchingAntsRect width={size.width} height={size.height} isDoor={false} color={color} />
        </div>
      ) : (
        <div style={overlayStyle} />
      )}
      {/* Mode toggle */}
      <div className="absolute bottom-2 right-2 flex gap-2">
        <button
          className={`px-3 py-1 rounded text-sm font-mono ${mode === 'passthrough' ? 'bg-header-active-bg text-header-active-fg' : 'bg-header-inactive-bg text-header-inactive-fg'}`}
          onClick={() => setMode('passthrough')}
        >passthrough</button>
        <button
          className={`px-3 py-1 rounded text-sm font-mono ${mode === 'command' ? 'bg-header-active-bg text-header-active-fg' : 'bg-header-inactive-bg text-header-inactive-fg'}`}
          onClick={() => setMode('command')}
        >command</button>
      </div>
    </div>
  );
}

const meta: Meta<typeof SelectionOverlayDemo> = {
  title: 'Components/SelectionOverlay',
  component: SelectionOverlayDemo,
};

export default meta;
type Story = StoryObj<typeof SelectionOverlayDemo>;

export const CommandMode: Story = {
  args: { initialMode: 'command' },
};

export const PassthroughMode: Story = {
  args: { initialMode: 'passthrough' },
};
