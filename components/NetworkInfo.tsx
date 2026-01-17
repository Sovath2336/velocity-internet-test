
import React from 'react';

interface NetworkInfoProps {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
  badge?: string;
}

const NetworkInfo: React.FC<NetworkInfoProps> = ({ icon, label, value, highlight, badge }) => {
  const getMetricColor = () => {
    if (!highlight) return '';
    if (label === 'LATENCY') return 'text-green-400';
    if (label === 'JITTER') return 'text-yellow-400';
    return '';
  };

  return (
    <div className={`glass px-4 py-3 rounded-xl flex flex-col gap-1 transition-colors duration-500 ${highlight ? 'bg-white/5 ring-1 ring-white/10' : ''}`}>
      <div className="flex items-center gap-2 opacity-40">
        <i className={`fa-solid ${icon} text-[10px]`}></i>
        <span className="text-[10px] font-bold tracking-widest uppercase">{label}</span>
      </div>
      <div className="flex items-center gap-2 overflow-hidden">
        {badge && <span className="text-xs shrink-0">{badge}</span>}
        <span className={`text-sm font-semibold truncate tabular-nums ${getMetricColor()}`}>
          {value}
        </span>
      </div>
    </div>
  );
};

export default NetworkInfo;
