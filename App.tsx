
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";

// --- SUB-COMPONENTS ---

const StatsCard: React.FC<{ label: string; value: number; unit: string; active: boolean; icon: string; color: string; }> = ({ label, value, unit, active, icon, color }) => (
  <div className={`glass p-4 md:p-6 rounded-2xl transition-all duration-300 ${active ? 'ring-2 ring-blue-500/50 scale-[1.02] md:scale-105 bg-blue-500/5' : ''}`}>
    <div className="flex justify-between items-start mb-1 md:mb-2">
      <div className="flex items-center gap-2 opacity-60">
        <i className={`fa-solid ${icon} text-[10px]`}></i>
        <span className="text-[10px] font-bold tracking-widest uppercase">{label}</span>
      </div>
      {active && (
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75"></span>
        </div>
      )}
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`text-3xl md:text-4xl font-bold tabular-nums ${color}`}>{value.toFixed(1)}</span>
      <span className="text-[10px] md:text-sm opacity-40 font-medium">{unit}</span>
    </div>
  </div>
);

const NetworkInfo: React.FC<{ icon: string; label: string; value: string; highlight?: boolean; badge?: string; }> = ({ icon, label, value, highlight, badge }) => (
  <div className={`glass px-3 py-2 md:px-4 md:py-3 rounded-xl flex flex-col gap-0.5 transition-colors duration-500 ${highlight ? 'bg-white/5 ring-1 ring-white/10' : ''}`}>
    <div className="flex items-center gap-1.5 opacity-40">
      <i className={`fa-solid ${icon} text-[8px] md:text-[10px]`}></i>
      <span className="text-[8px] md:text-[10px] font-bold tracking-widest uppercase">{label}</span>
    </div>
    <div className="flex items-center gap-1.5 overflow-hidden">
      {badge && <span className="text-[10px] shrink-0">{badge}</span>}
      <span className={`text-xs md:text-sm font-semibold truncate tabular-nums ${highlight ? (label === 'LATENCY' ? 'text-green-400' : 'text-yellow-400') : ''}`}>
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
    <div className="relative w-56 h-56 md:w-96 md:h-96 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none">
        <circle cx="50%" cy="50%" r="45%" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle
          cx="50%" cy="50%" r="45%" fill="transparent"
          stroke={getProgressColor()} strokeWidth="6"
          strokeDasharray="282.6"
          strokeDashoffset={282.6 - (282.6 * (phase === 'TRANSITION' ? 100 : progress) / 100)}
          strokeLinecap="round"
          className={`transition-all duration-300 ease-out ${phase === 'TRANSITION' ? 'opacity-20 animate-pulse' : ''}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none px-4">
        <span className="text-[10px] md:text-sm font-medium opacity-40 uppercase tracking-widest mb-0.5 md:mb-1">
          {phase === 'IDLE' ? 'Ready' : phase === 'TRANSITION' ? 'Optimizing' : phase === 'COMPLETE' ? 'Result' : phase}
        </span>
        <div className="flex items-baseline gap-0.5 md:gap-1">
          <span className={`text-5xl md:text-8xl font-bold tracking-tighter tabular-nums transition-all duration-75 ${phase === 'TRANSITION' ? 'opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
            {Math.floor(value)}
          </span>
          <span className={`text-base md:text-2xl font-light opacity-60 ${phase === 'TRANSITION' ? 'opacity-10' : ''}`}>Mbps</span>
        </div>
      </div>
      <div 
        className={`absolute top-1/2 left-1/2 w-0.5 md:w-1 h-[45%] bg-white/20 origin-bottom rounded-full transition-transform duration-300 ease-out will-change-transform ${phase === 'TRANSITION' ? 'opacity-10' : 'opacity-100'}`}
        style={{ transform: `translate(-50%, -100%) rotate(${phase === 'TRANSITION' ? -120 : rotation}deg)` }}
      >
        <div className={`w-0.5 md:w-1 h-8 md:h-12 rounded-full shadow-[0_0_10px_#3b82f6] ${phase === 'UPLOAD' ? 'bg-purple-500 shadow-purple-500' : 'bg-blue-500 shadow-blue-500'}`}></div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

const SERVERS = [
  { id: 'cloudflare-global', name: 'Cloudflare Edge', regionCode: '🌐', downloadUrl: 'https://speed.cloudflare.com/__down?bytes=50000000', uploadUrl: 'https://speed.cloudflare.com/__up', traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace' },
  { id: 'google-global', name: 'Google Infra', regionCode: '🇺🇸', downloadUrl: 'https://storage.googleapis.com/connectivity-test-assets/test-100mb.bin', uploadUrl: 'https://httpbin.org/post', traceUrl: 'https://www.google.com/generate_204' }
];

const TEST_DURATION_MS = 8000; 
const RAMP_UP_THRESHOLD_MS = 1200; 

enum TestPhase { IDLE = 'IDLE', PING = 'PING', DOWNLOAD = 'DOWNLOAD', TRANSITION = 'TRANSITION', UPLOAD = 'UPLOAD', COMPLETE = 'COMPLETE' }

const App: React.FC = () => {
  const [phase, setPhase] = useState<TestPhase>(TestPhase.IDLE);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [livePing, setLivePing] = useState<number>(0);
  const [jitter, setJitter] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [provider, setProvider] = useState<string>("Detecting...");
  const [selectedServer, setSelectedServer] = useState(SERVERS[0]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [gaugeValue, setGaugeValue] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState<boolean>(false);

  useEffect(() => {
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
    const res = { download: downloadSpeed, upload: uploadSpeed, ping, jitter };
    const shareText = `Velocity Speed Test: ${downloadSpeed.toFixed(1)} Mbps Down / ${uploadSpeed.toFixed(1)} Mbps Up`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Velocity Network Stats', text: shareText, url: window.location.href }); } catch (err) {}
    } else {
      await navigator.clipboard.writeText(shareText);
      setToastMessage("STATS COPIED");
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
    }, 4000);
    return () => clearInterval(interval);
  }, [phase, selectedServer]);

  const runTest = async (type: 'DOWNLOAD' | 'UPLOAD') => {
    setPhase(type === 'DOWNLOAD' ? TestPhase.DOWNLOAD : TestPhase.UPLOAD);
    const testStart = performance.now();
    let bytes = 0;
    const samples: number[] = [];
    const ctrl = new AbortController();
    const testTimeout = setTimeout(() => ctrl.abort(), TEST_DURATION_MS);

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
              if (done || ctrl.signal.aborted) break;
              bytes += value.length;
              updateMetrics(bytes, testStart, samples, type);
            }
          } else {
            bytes += 1024 * 512;
            updateMetrics(bytes, testStart, samples, type);
            if (ctrl.signal.aborted) break;
            await new Promise(r => setTimeout(r, 10)); 
          }
        } catch (e) { break; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    clearTimeout(testTimeout);
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
      setProgress(Math.min((elapsed / TEST_DURATION_MS) * 100, 100));
    }
  };

  const startTest = async () => {
    setShowResultOverlay(false);
    setShowHistory(false);
    setPhase(TestPhase.PING);
    setProgress(0);
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setGaugeValue(0);

    const pings = [];
    for(let i=0; i<4; i++) {
      const s = performance.now();
      try { await fetch(selectedServer.traceUrl, { mode: 'no-cors', cache: 'no-store' }); pings.push(performance.now() - s); } catch { pings.push(999); }
      await new Promise(r => setTimeout(r, 100));
    }
    const cleanPings = pings.sort((a,b) => a-b);
    setPing(Math.round(cleanPings.reduce((a,b) => a+b, 0) / 4));
    setJitter(Math.round(cleanPings[cleanPings.length-1] - cleanPings[0]));
    
    const dl = await runTest('DOWNLOAD');
    setDownloadSpeed(dl);
    setPhase(TestPhase.TRANSITION);
    setGaugeValue(0);
    await new Promise(r => setTimeout(r, 1200));
    const ul = await runTest('UPLOAD');
    setUploadSpeed(ul);
    setPhase(TestPhase.COMPLETE);
    setGaugeValue(0);
    setShowResultOverlay(true);
    saveToHistory({ 
      id: Date.now(), 
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }), 
      download: dl, 
      upload: ul, 
      ping: Math.round(cleanPings[0]), 
      jitter: Math.round(cleanPings[cleanPings.length-1] - cleanPings[0])
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-[100vw] overflow-x-hidden">
      <style>{`
        @keyframes invite-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(37, 99, 235, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        .pulse-inviting {
          animation: invite-pulse 2s infinite ease-in-out;
        }
      `}</style>

      {showResultOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass w-full max-md rounded-[2.5rem] p-6 md:p-10 text-center relative animate-in zoom-in-95 duration-500">
            <button onClick={() => setShowResultOverlay(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100"><i className="fa-solid fa-xmark text-xl"></i></button>
            <h2 className="text-3xl font-black mb-6 uppercase tracking-tighter">Engine Result</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="glass p-5 rounded-2xl">
                <div className="text-[8px] opacity-40 uppercase mb-1 font-bold">Download</div>
                <div className="text-2xl font-bold text-blue-400">{downloadSpeed.toFixed(1)}</div>
              </div>
              <div className="glass p-5 rounded-2xl">
                <div className="text-[8px] opacity-40 uppercase mb-1 font-bold">Upload</div>
                <div className="text-2xl font-bold text-purple-400">{uploadSpeed.toFixed(1)}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={shareResult} className="w-full py-4 glass border-white/10 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                <i className="fa-solid fa-share"></i> Share
              </button>
              <button onClick={startTest} className="w-full py-5 bg-blue-600 rounded-xl font-bold uppercase tracking-[0.2em] text-sm shadow-lg shadow-blue-600/30 pulse-inviting">
                Test Again
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] glass px-4 py-2 rounded-full border-blue-500/30 border text-[10px] font-bold text-blue-400 animate-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      <header className="w-full max-w-5xl flex justify-between items-center py-4 md:py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 md:w-11 md:h-11 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
            <i className="fa-solid fa-bolt-lightning text-white text-lg md:text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tighter uppercase leading-none">Velocity</h1>
            <span className="text-[8px] font-bold opacity-30 tracking-widest">CORE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(!showHistory)} className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-xs">
            <i className={`fa-solid ${showHistory ? 'fa-xmark' : 'fa-list-ul'}`}></i>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl flex flex-col items-center justify-center py-4 md:py-10 gap-6 md:gap-12">
        {showHistory ? (
          <div className="w-full max-w-md glass rounded-[2rem] p-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold uppercase tracking-tight">Logs</h2>
              <button onClick={() => { localStorage.removeItem('velocity_history'); setHistory([]); }} className="text-[10px] opacity-40 uppercase font-bold">Clear All</button>
            </div>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {history.length > 0 ? history.map((h, i) => (
                <div key={i} className="flex justify-between items-center glass p-4 rounded-xl text-[10px] border-white/5">
                  <span className="opacity-40">{h.date}</span>
                  <div className="flex gap-4 font-bold">
                    <span className="text-blue-400">{h.download.toFixed(1)} <span className="opacity-40">DL</span></span>
                    <span className="text-purple-400">{h.upload.toFixed(1)} <span className="opacity-40">UL</span></span>
                  </div>
                </div>
              )) : <div className="text-center py-12 opacity-20 text-xs">No logs found.</div>}
            </div>
            <button onClick={() => setShowHistory(false)} className="w-full mt-6 py-3 glass border-white/10 rounded-xl font-bold uppercase text-[10px]">Back</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-12 w-full">
              <div className="order-2 lg:order-1 w-full lg:w-1/3">
                <StatsCard label="DOWNLOAD" value={downloadSpeed} unit="Mbps" active={phase === TestPhase.DOWNLOAD} icon="fa-download" color="text-blue-400" />
              </div>
              
              <div className="order-1 lg:order-2 flex flex-col items-center gap-6 md:gap-10 w-full lg:w-1/3">
                <SpeedGauge value={gaugeValue} phase={phase} progress={progress} />
                <button 
                  onClick={startTest} 
                  disabled={phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE} 
                  className={`w-48 md:w-64 py-5 md:py-6 bg-blue-600 hover:bg-blue-500 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl tracking-[0.2em] shadow-xl shadow-blue-600/40 active:scale-95 transition-all disabled:opacity-20 ${(phase === TestPhase.IDLE || phase === TestPhase.COMPLETE) ? 'pulse-inviting' : ''}`}
                >
                  {phase === TestPhase.IDLE || phase === TestPhase.COMPLETE ? 'START' : 'TESTING'}
                </button>
              </div>

              <div className="order-3 lg:order-3 w-full lg:w-1/3">
                <StatsCard label="UPLOAD" value={uploadSpeed} unit="Mbps" active={phase === TestPhase.UPLOAD} icon="fa-upload" color="text-purple-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 w-full max-w-4xl">
              <NetworkInfo icon="fa-clock" label="LATENCY" value={`${phase === TestPhase.IDLE ? livePing : ping}ms`} highlight />
              <NetworkInfo icon="fa-wave-square" label="JITTER" value={`${jitter}ms`} highlight />
              <div className="glass px-3 py-2 md:px-4 md:py-3 rounded-xl flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 opacity-40">
                  <i className="fa-solid fa-server text-[8px] md:text-[10px]"></i>
                  <span className="text-[8px] md:text-[10px] font-bold tracking-widest uppercase">SERVER</span>
                </div>
                <select value={selectedServer.id} onChange={(e) => setSelectedServer(SERVERS.find(s => s.id === e.target.value) || SERVERS[0])} className="bg-transparent text-[10px] md:text-sm font-semibold outline-none cursor-pointer appearance-none truncate">
                  {SERVERS.map(s => <option key={s.id} value={s.id} className="bg-black text-white">{s.name}</option>)}
                </select>
              </div>
              <NetworkInfo icon="fa-wifi" label="ISP" value={provider} />
            </div>
          </>
        )}
      </main>

      <footer className="w-full max-w-5xl py-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center opacity-30 text-[8px] font-bold uppercase tracking-[0.2em] gap-4 text-center">
        <span>&copy; 2025 VELOCITY NETWORK SYSTEM</span>
        <div className="flex gap-6">
          <button className="hover:text-white transition-colors">Privacy</button>
          <button className="hover:text-white transition-colors">Compliance</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
