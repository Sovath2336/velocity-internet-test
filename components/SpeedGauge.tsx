
import React, { useMemo } from 'react';

interface SpeedGaugeProps {
  value: number;
  phase: string;
  progress: number;
}

const SpeedGauge: React.FC<SpeedGaugeProps> = ({ value, phase, progress }) => {
  const maxValue = 1000; // Max 1Gbps gauge scale
  
  const rotation = useMemo(() => {
    const percentage = Math.min((value / maxValue) * 100, 100);
    return (percentage * 2.4) - 120; // -120 to 120 degrees arc
  }, [value]);

  return (
    <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
      {/* Background Ring */}
      <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none">
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          fill="transparent"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="8"
          strokeDasharray="282.6"
          strokeDashoffset="0"
        />
        {/* Progress Fill - Smooth SVG Transition */}
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          fill="transparent"
          stroke={phase === 'UPLOAD' ? '#c084fc' : '#3b82f6'}
          strokeWidth="8"
          strokeDasharray="282.6"
          strokeDashoffset={282.6 - (282.6 * progress / 100)}
          strokeLinecap="round"
          className="transition-all duration-300 ease-out"
          style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.3))' }}
        />
      </svg>

      {/* Gauge Center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        <span className="text-sm font-medium opacity-40 uppercase tracking-widest mb-1">
          {phase === 'IDLE' ? 'Ready' : phase === 'COMPLETE' ? 'Result' : phase}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-6xl md:text-8xl font-bold tracking-tighter tabular-nums transition-all duration-75">
            {Math.floor(value)}
          </span>
          <span className="text-xl md:text-2xl font-light opacity-60">Mbps</span>
        </div>
      </div>

      {/* Needle - High Performance Transform */}
      <div 
        className="absolute top-1/2 left-1/2 w-1 h-[45%] bg-white/20 origin-bottom rounded-full transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: `translate(-50%, -100%) rotate(${rotation}deg)` }}
      >
        <div className="w-1 h-12 bg-blue-500 rounded-full shadow-[0_0_15px_#3b82f6]"></div>
      </div>

      {/* Decorative Dots */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        {[...Array(20)].map((_, i) => (
          <div 
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: '50%',
              top: '50%',
              transform: `rotate(${i * 18 - 90}deg) translateY(-140px)`
            }}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default SpeedGauge;
