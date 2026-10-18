import { useEffect, useRef } from 'react';
import { fx } from './fx';
import { rain } from './rain';
import { applyToDocument, useSettings } from '../ui/settings';
import { useEventProcessor } from './useEventProcessor';

/** Два Pixi-канваса: дождь позади интерфейса и эффекты поверх. */
export function FxHost() {
  const bgRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const motion = useSettings((s) => s.motion);

  useEffect(() => {
    if (bgRef.current) void rain.mount(bgRef.current);
    if (fgRef.current) void fx.mount(fgRef.current);
    return () => {
      rain.unmount();
      fx.unmount();
    };
  }, []);

  useEffect(() => {
    applyToDocument();
    rain.applyMotion();
  }, [motion]);

  useEventProcessor();

  return (
    <>
      <div className="rain-host" ref={bgRef} aria-hidden="true" />
      <div className="fx-host" ref={fgRef} aria-hidden="true" />
    </>
  );
}
