import { useEffect, useRef } from 'react';
import { fx } from './fx';
import { rain } from './rain';
import { applyToDocument, useSettings } from '../ui/settings';
import { useEventProcessor } from './useEventProcessor';
import { applyGfx, probeFrameRate, useGfx } from './perf-mode';

/** Два Pixi-канваса: дождь позади интерфейса и эффекты поверх. */
export function FxHost() {
  const bgRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const motion = useSettings((s) => s.motion);
  const lite = useGfx((s) => s.lite);

  useEffect(() => {
    if (fgRef.current) void fx.mount(fgRef.current);
    return () => fx.unmount();
  }, []);

  useEffect(() => {
    applyGfx();
    // Телефон и экономия графики: второй полноэкранный WebGL-канвас под DOM заметно грузит GPU — фон без дождя
    const phone = matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
    if (bgRef.current && !phone && !lite) void rain.mount(bgRef.current);
    return () => rain.unmount();
  }, [lite]);

  useEffect(() => probeFrameRate(), []);

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
