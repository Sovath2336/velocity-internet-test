
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { GoogleGenAI } from "@google/genai";

// --- SUB-COMPONENTS (Consolidated for ESM Reliability) ---

const StatsCard: React.FC<{ label: string; value: number; unit: string; active: boolean; icon: string; color: string; }> = ({ label, value, unit, active, icon, color }) => (
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

const NetworkInfo: React.FC<{ icon: string; label: string; value: string; highlight?: boolean; badge?: string; }> = ({ icon, label, value, highlight, badge }) => (
  <div className={`glass px-4 py-3 rounded-xl flex flex-col gap-1 transition-colors duration-500 ${highlight ? 'bg-white/5 ring-1 ring-white/10' : ''}`}>
    <div className="flex items-center gap-2 opacity-40">
      <i className={`fa-solid ${icon} text-[10px]`}></i>
      <span className="text-[10px] font-bold tracking-widest uppercase">{label}</span>
    </div>
    <div className="flex items-center gap-2 overflow-hidden">
      {badge && <span className="text-xs shrink-0">{badge}</span>}
      <span className={`text-sm font-semibold truncate tabular-nums ${highlight ? (label === 'LATENCY' ? 'text-green-400' : 'text-yellow-400') : ''}`}>
        {value}
      </span>
    </div>
  </div>
);

const SpeedGauge: React.FC<{ value: number; phase: string; progress: number; }> = ({ value, phase, progress }) => {
  const maxValue = 1000;
  const rotation = useMemo(() => {
    const percentage = Math.min((value / maxValue) * 100, 100);
    return (percentage * 2.4) - 120;
  }, [value]);

  const getProgressColor = () => {
    if (phase === 'UPLOAD') return '#c084fc';
    if (phase === 'TRANSITION') return '#ffffff';
    return '#3b82f6';
  };

  return (
    <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none">
        <circle cx="50%" cy="50%" r="45%" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx="50%" cy="50%" r="45%" fill="transparent"
          stroke={getProgressColor()} strokeWidth="8"
          strokeDasharray="282.6"
          strokeDashoffset={282.6 - (282.6 * (phase === 'TRANSITION' ? 100 : progress) / 100)}
          strokeLinecap="round"
          className={`transition-all duration-300 ease-out ${phase === 'TRANSITION' ? 'opacity-20 animate-pulse' : ''}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        <span className="text-sm font-medium opacity-40 uppercase tracking-widest mb-1">
          {phase === 'IDLE' ? 'Ready' : phase === 'TRANSITION' ? 'Optimizing' : phase === 'COMPLETE' ? 'Result' : phase}
        </span>
        <div className="flex items-baseline gap-1">
          <span className={`text-6xl md:text-8xl font-bold tracking-tighter tabular-nums transition-all duration-75 ${phase === 'TRANSITION' ? 'opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
            {Math.floor(value)}
          </span>
          <span className={`text-xl md:text-2xl font-light opacity-60 ${phase === 'TRANSITION' ? 'opacity-10' : ''}`}>Mbps</span>
        </div>
      </div>
      <div 
        className={`absolute top-1/2 left-1/2 w-1 h-[45%] bg-white/20 origin-bottom rounded-full transition-transform duration-300 ease-out will-change-transform ${phase === 'TRANSITION' ? 'opacity-10' : 'opacity-100'}`}
        style={{ transform: `translate(-50%, -100%) rotate(${phase === 'TRANSITION' ? -120 : rotation}deg)` }}
      >
        <div className={`w-1 h-12 rounded-full shadow-[0_0_15px_#3b82f6] ${phase === 'UPLOAD' ? 'bg-purple-500 shadow-purple-500' : 'bg-blue-500 shadow-blue-500'}`}></div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

const SERVERS = [
  { id: 'cloudflare-global', name: 'Cloudflare Edge', regionCode: '🌐', downloadUrl: 'https://speed.cloudflare.com/__down?bytes=50000000', uploadUrl: 'https://speed.cloudflare.com/__up', traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace' },
  { id: 'google-global', name: 'Google Infrastructure', regionCode: '🇺🇸', downloadUrl: 'https://storage.googleapis.com/connectivity-test-assets/test-100mb.bin', uploadUrl: 'https://httpbin.org/post', traceUrl: 'https://www.google.com/generate_204' }
];

const TEST_DURATION_MS = 8000; 
const CONCURRENT_STREAMS = 4;
const RAMP_UP_THRESHOLD_MS = 1200; 

enum TestPhase { IDLE = 'IDLE', PING = 'PING', DOWNLOAD = 'DOWNLOAD', TRANSITION = 'TRANSITION', UPLOAD = 'UPLOAD', COMPLETE = 'COMPLETE' }

const App: React.FC = () => {
  const [phase, setPhase] = useState<TestPhase>(TestPhase.IDLE);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [livePing, setLivePing] = useState<number>(0);
  const [liveJitter, setLiveJitter] = useState<number>(0);
  const [jitter, setJitter] = useState<number>(0);
  const [downloadHistory, setDownloadHistory] = useState<{time:number, value:number}[]>([]);
  const [uploadHistory, setUploadHistory] = useState<{time:number, value:number}[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [provider, setProvider] = useState<string>("Detecting...");
  const [selectedServer, setSelectedServer] = useState(SERVERS[0]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [gaugeValue, setGaugeValue] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sharedResult, setSharedResult] = useState<any | null>(null);
  const [footerSection, setFooterSection] = useState<string | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState<boolean>(false);

  const lastHistoryUpdateRef = useRef(0);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#result=')) {
      try {
        const decoded = JSON.parse(atob(hash.split('#result=')[1]));
        setSharedResult(decoded);
      } catch (e) {}
    }
    const saved = localStorage.getItem('velocity_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch (e) {}
    fetch('https://ipapi.co/json/').then(res => res.json()).then(data => setProvider(data.org || "Unknown ISP")).catch(() => setProvider("Unknown ISP"));
  }, []);

  const saveToHistory = useCallback((res: any) => {
    setHistory(prev => {
      const updated = [res, ...prev].slice(0, 15);
      localStorage.setItem('velocity_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const shareResult = async () => {
    const res = { id: Date.now().toString(), date: new Date().toLocaleDateString(), download: downloadSpeed, upload: uploadSpeed, ping, jitter };
    const shareUrl = `${window.location.origin}${window.location.pathname}#result=${btoa(JSON.stringify(res))}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Velocity Network Stats', url: shareUrl }); } catch (err) {}
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setToastMessage("LINK COPIED");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  useEffect(() => {
    if (phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE) return;
    const interval = setInterval(async () => {
      const s = performance.now();
      try {
        await fetch(selectedServer.traceUrl, { mode: 'no-cors', cache: 'no-store' });
        setLivePing(Math.round(performance.now() - s));
        setIsConnected(true);
      } catch { setIsConnected(false); }
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, selectedServer]);

  const runTest = async (type: 'DOWNLOAD' | 'UPLOAD') => {
    setPhase(type === 'DOWNLOAD' ? TestPhase.DOWNLOAD : TestPhase.UPLOAD);
    const testStart = performance.now();
    let bytes = 0;
    const samples: number[] = [];
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), TEST_DURATION_MS);

    const worker = async () => {
      while (performance.now() - testStart < TEST_DURATION_MS) {
        try {
          const url = type === 'DOWNLOAD' ? `${selectedServer.downloadUrl}&cb=${Date.now()}` : `${selectedServer.uploadUrl}?cb=${Date.now()}`;
          const res = await fetch(url, { method: type === 'DOWNLOAD' ? 'GET' : 'POST', signal: ctrl.signal, cache: 'no-store' });
          if (type === 'DOWNLOAD') {
            const reader = res.body?.getReader();
            if (!reader) break;
            while(true) {
              const {done, value} = await reader.read();
              if (done) break;
              bytes += value.length;
              updateMetrics(bytes, testStart, samples, type);
            }
          } else {
            bytes += 1024 * 1024; // 1MB simulated chunk
            updateMetrics(bytes, testStart, samples, type);
          }
        } catch (e) { break; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return samples.length > 0 ? samples.sort((a,b) => a-b)[Math.floor(samples.length * 0.8)] : 0;
  };

  const updateMetrics = (total: number, start: number, samples: number[], type: string) => {
    const now = performance.now();
    const elapsed = now - start;
    if (elapsed > RAMP_UP_THRESHOLD_MS) {
      const mbps = (total * 8) / (elapsed * 1000);
      samples.push(mbps);
      setGaugeValue(mbps);
      if (type === 'DOWNLOAD') setDownloadSpeed(mbps); else setUploadSpeed(mbps);
      setProgress((elapsed / TEST_DURATION_MS) * 100);
    }
  };

  const startTest = async () => {
    setPhase(TestPhase.PING);
    setProgress(0);
    setDownloadSpeed(0);
    setUploadSpeed(0);
    const pings = [];
    for(let i=0; i<4; i++) {
      const s = performance.now();
      await fetch(selectedServer.traceUrl, { mode: 'no-cors' });
      pings.push(performance.now() - s);
    }
    setPing(Math.round(pings.reduce((a,b) => a+b, 0) / 4));
    
    const dl = await runTest('DOWNLOAD');
    setDownloadSpeed(dl);
    setPhase(TestPhase.TRANSITION);
    setGaugeValue(0);
    await new Promise(r => setTimeout(r, 1200));
    
    const ul = await runTest('UPLOAD');
    setUploadSpeed(ul);
    setPhase(TestPhase.COMPLETE);
    setShowResultOverlay(true);
    saveToHistory({ id: Date.now(), date: new Date().toLocaleDateString(), download: dl, upload: ul, ping, jitter });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      {showResultOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="glass w-full max-w-xl rounded-[3rem] p-12 text-center relative">
            <button onClick={() => setShowResultOverlay(false)} className="absolute top-8 right-8 opacity-40 hover:opacity-100"><i className="fa-solid fa-xmark text-2xl"></i></button>
            <h2 className="text-4xl font-black mb-8 uppercase tracking-tighter">Engine Summary</h2>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="glass p-6 rounded-2xl"><div className="text-[10px] opacity-40 uppercase mb-1">Download</div><div className="text-3xl font-bold text-blue-400">{downloadSpeed.toFixed(1)}</div></div>
              <div className="glass p-6 rounded-2xl"><div className="text-[10px] opacity-40 uppercase mb-1">Upload</div><div className="text-3xl font-bold text-purple-400">{uploadSpeed.toFixed(1)}</div></div>
            </div>
            <button onClick={shareResult} className="w-full py-5 bg-blue-600 rounded-2xl font-bold uppercase tracking-widest mb-4">Share Performance</button>
            <button onClick={startTest} className="w-full py-5 glass rounded-2xl font-bold uppercase tracking-widest">Restart Engine</button>
          </div>
        </div>
      )}

      {toastMessage && <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[110] glass px-6 py-3 rounded-2xl border-blue-500/50 border text-xs font-bold text-blue-400">{toastMessage}</div>}

      <header className="w-full max-w-6xl flex justify-between items-center py-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/40"><i className="fa-solid fa-bolt-lightning text-white text-2xl"></i></div>
          <div><h1 className="text-3xl font-bold tracking-tighter uppercase leading-none">Velocity</h1><span className="text-[10px] font-bold opacity-30 tracking-[0.2em]">PRECISION ENGINE</span></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="glass px-4 py-2 rounded-full flex items-center gap-3">
             <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
             <select value={selectedServer.id} onChange={(e) => setSelectedServer(SERVERS.find(s => s.id === e.target.value) || SERVERS[0])} className="bg-transparent text-xs font-bold opacity-60 uppercase outline-none">
               {SERVERS.map(s => <option key={s.id} value={s.id} className="bg-black">{s.name}</option>)}
             </select>
          </div>
          <button onClick={() => setShowHistory(!showHistory)} className="px-5 py-2 rounded-full border border-white/20 text-xs font-bold uppercase">Log</button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center py-10 gap-12">
        {showHistory ? (
          <div className="w-full max-w-2xl glass rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-6">
            <h2 className="text-2xl font-bold mb-8">History</h2>
            <div className="space-y-3">{history.map((h, i) => <div key={i} className="flex justify-between glass p-4 rounded-xl text-sm"><span>{h.date}</span><span className="font-bold">{h.download.toFixed(1)} Mbps</span></div>)}</div>
            <button onClick={() => setShowHistory(false)} className="w-full mt-8 py-4 glass rounded-xl font-bold uppercase text-xs">Close</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 w-full items-center">
              <StatsCard label="DOWNLOAD" value={downloadSpeed} unit="Mbps" active={phase === TestPhase.DOWNLOAD} icon="fa-download" color="text-blue-400" />
              <div className="flex flex-col items-center gap-10">
                <SpeedGauge value={gaugeValue} phase={phase} progress={progress} />
                <button onClick={startTest} disabled={phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE} className="px-16 py-5 bg-blue-600 rounded-3xl font-black text-xl tracking-[0.2em] shadow-xl shadow-blue-600/40 active:scale-95 transition-all disabled:opacity-20">
                  {phase === TestPhase.IDLE || phase === TestPhase.COMPLETE ? 'START' : 'TESTING'}
                </button>
              </div>
              <StatsCard label="UPLOAD" value={uploadSpeed} unit="Mbps" active={phase === TestPhase.UPLOAD} icon="fa-upload" color="text-purple-400" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-4xl">
              <NetworkInfo icon="fa-clock" label="LATENCY" value={`${phase === TestPhase.IDLE ? livePing : ping}ms`} highlight />
              <NetworkInfo icon="fa-wave-square" label="JITTER" value={`${liveJitter}ms`} highlight />
              <NetworkInfo icon="fa-server" label="SERVER" value={selectedServer.name} badge={selectedServer.regionCode} />
              <NetworkInfo icon="fa-wifi" label="ISP" value={provider} />
            </div>
          </>
        )}
      </main>

      <footer className="w-full max-w-6xl py-12 border-t border-white/10 flex justify-between items-center opacity-40 text-[10px] font-bold uppercase tracking-widest">
        <span>&copy; 2025 VELOCITY CORE</span>
        <div className="flex gap-6">
          <button onClick={() => setFooterSection('privacy')}>Privacy</button>
          <button onClick={() => setFooterSection('methodology')}>Methodology</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
