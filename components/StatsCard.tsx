
import React from 'react';

interface StatsCardProps {
  label: string;
  value: number;
  unit: string;
  active: boolean;
  icon: string;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, unit, active, icon, color }) => {
  return (
    <div className={`glass p-6 rounded-2xl transition-all duration-300 ${active ? 'ring-2 ring-blue-500/50 scale-105 bg-blue-500/5' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 opacity-60">
          <i className={`fa-solid ${icon} text-xs`}></i>
          <span className="text-xs font-bold tracking-widest">{label}</span>
        </div>
        {active && (
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-150"></span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-4xl font-bold tabular-nums ${color}`}>{value.toFixed(1)}</span>
        <span className="text-sm opacity-40 font-medium">{unit}</span>
      </div>
    </div>
  );
};

export default StatsCard;
