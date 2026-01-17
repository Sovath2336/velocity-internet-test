
import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- TYPES ---
enum TestPhase { IDLE = 'IDLE', PING = 'PING', DOWNLOAD = 'DOWNLOAD', TRANSITION = 'TRANSITION', UPLOAD = 'UPLOAD', COMPLETE = 'COMPLETE' }

interface TestResult {
  id: number;
  date: string;
  download: number;
  upload: number;
  ping: number;
  jitter: number;
}

// --- SUB-COMPONENTS ---

const StatsCard: React.FC<{ label: string; value: number; unit: string; active: boolean; icon: string; colorClass: string; activeGlow: string; }> = ({ label, value, unit, active, icon, colorClass, activeGlow }) => (
  <div className={`glass p-4 md:p-6 rounded-3xl transition-all duration-700 relative overflow-hidden ${active ? `ring-2 ${activeGlow} scale-[1.05] bg-white/5 shadow-2xl z-20` : 'opacity-60'}`}>
    {active && (
      <div className={`absolute inset-0 opacity-10 animate-pulse ${activeGlow.replace('ring-', 'bg-')}`}></div>
    )}
    <div className="flex justify-between items-start mb-2 md:mb-3 relative z-10">
      <div className="flex items-center gap-2 opacity-80">
        <i className={`fa-solid ${icon} text-[10px] ${active ? colorClass : ''}`}></i>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${active ? 'text-white' : ''}`}>{label}</span>
      </div>
      {active && (
        <div className="flex gap-1.5">
          <span className={`w-2 h-2 rounded-full animate-ping ${activeGlow.replace('ring-', 'bg-')}`}></span>
        </div>
      )}
    </div>
    <div className="flex items-baseline gap-2 relative z-10">
      <span className={`text-4xl md:text-5xl font-black tabular-nums transition-colors duration-500 ${active ? colorClass : 'text-white/40'}`}>
        {value.toFixed(1)}
      </span>
      <span className="text-[10px] md:text-sm opacity-40 font-bold uppercase tracking-tight">
        {unit}
      </span>
    </div>
  </div>
);

const NetworkInfo: React.FC<{ icon: string; label: string; value: string; highlight?: boolean; }> = ({ icon, label, value, highlight }) => (
  <div className={`glass px-4 py-3 rounded-2xl flex flex-col gap-1 transition-all duration-500 ${highlight ? 'bg-white/5 border-white/20' : 'border-transparent'}`}>
    <div className="flex items-center gap-1.5 opacity-40">
      <i className={`fa-solid ${icon} text-[9px]`}></i>
      <span className="text-[9px] font-bold tracking-widest uppercase">{label}</span>
    </div>
    <span className={`text-sm font-bold truncate tabular-nums ${highlight ? 'text-blue-400' : 'opacity-80'}`}>
      {value}
    </span>
  </div>
);

const SpeedGauge: React.FC<{ value: number; phase: string; progress: number; }> = ({ value, phase, progress }) => {
  const maxValue = 1000;
  const rotation = useMemo(() => {
    const percentage = Math.min((value / maxValue) * 100, 100);
    return (percentage * 2.4) - 120;
  }, [value]);

  const theme = useMemo(() => {
    if (phase === 'UPLOAD') return { color: '#c084fc', shadow: 'rgba(192, 132, 252, 0.4)', text: 'text-purple-400' };
    if (phase === 'DOWNLOAD') return { color: '#3b82f6', shadow: 'rgba(59, 130, 246, 0.4)', text: 'text-blue-400' };
    return { color: '#ffffff', shadow: 'rgba(255, 255, 255, 0.1)', text: 'text-white/40' };
  }, [phase]);

  return (
    <div className="relative w-64 h-64 md:w-[420px] md:h-[420px] flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
        <circle cx="50%" cy="50%" r="42%" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
        <circle
          cx="50%" cy="50%" r="42%" fill="transparent"
          stroke={theme.color} strokeWidth="14"
          strokeDasharray="264"
          strokeDashoffset={264 - (264 * progress / 100)}
          strokeLinecap="round"
          className="transition-all duration-300 ease-linear"
          style={{ 
            opacity: phase === 'IDLE' ? 0.1 : 1,
            filter: `drop-shadow(0 0 8px ${theme.shadow})`
          }}
        />
      </svg>
      
      {(phase === 'DOWNLOAD' || phase === 'UPLOAD') && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`absolute w-full h-full rounded-full border-4 opacity-0 animate-ping-slow`} 
               style={{ borderColor: theme.color }}></div>
          <div className={`absolute w-3/4 h-3/4 rounded-full border-2 opacity-0 animate-ping-slower`} 
               style={{ borderColor: theme.color }}></div>
        </div>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-8">
        <div className={`text-xs md:text-sm font-bold uppercase tracking-[0.4em] mb-2 transition-colors duration-500 ${theme.text}`}>
          {phase === 'IDLE' ? 'System Ready' : 
           phase === 'TRANSITION' ? 'Switching Buffer' : 
           phase === 'DOWNLOAD' ? '↓ Fetching Stream' : 
           phase === 'UPLOAD' ? '↑ Pushing Payload' : 
           'Diagnostic Final'}
        </div>
        <div className="flex items-baseline justify-center">
          <span className={`text-6xl md:text-9xl font-black tracking-tighter tabular-nums leading-none transition-colors duration-500 ${phase === 'IDLE' ? 'text-white/20' : 'text-white'}`}>
            {Math.floor(value)}
          </span>
          <span className="text-xl md:text-4xl font-light opacity-40 ml-2">Mbps</span>
        </div>
      </div>

      <div 
        className="absolute top-1/2 left-1/2 w-1 md:w-1.5 h-[42%] origin-bottom transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: `translate(-50%, -100%) rotate(${rotation}deg)`, opacity: phase === 'IDLE' ? 0.2 : 1 }}
      >
        <div className="w-full h-12 md:h-16 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"></div>
        <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full blur-md animate-pulse`} 
             style={{ backgroundColor: theme.color }}></div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

const SERVERS = [
  { id: 'cf', name: 'Cloudflare Global Edge', downloadUrl: 'https://speed.cloudflare.com/__down?bytes=100000000', uploadUrl: 'https://speed.cloudflare.com/__up', traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace' },
  { id: 'goog', name: 'Google Cloud Platform', downloadUrl: 'https://storage.googleapis.com/connectivity-test-assets/test-100mb.bin', uploadUrl: 'https://httpbin.org/post', traceUrl: 'https://www.google.com/generate_204' }
];

const TEST_CONFIG = {
  DURATION: 12000,
  RAMP_UP: 2500,
  THREADS: 12, // Increased for better saturation
};

const App: React.FC = () => {
  const [phase, setPhase] = useState<TestPhase>(TestPhase.IDLE);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [ping, setPing] = useState(0);
  const [livePing, setLivePing] = useState(0);
  const [jitter, setJitter] = useState(0);
  const [progress, setProgress] = useState(0);
  const [provider, setProvider] = useState("Scanning Network...");
  const [selectedServer, setSelectedServer] = useState(SERVERS[0]);
  const [history, setHistory] = useState<TestResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [gaugeValue, setGaugeValue] = useState(0);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('velocity_v2_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch (e) {}
    fetch('https://ipapi.co/json/').then(res => res.json()).then(data => setProvider(data.org || "Global ISP")).catch(() => setProvider("External Network"));
  }, []);

  useEffect(() => {
    if (phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE) return;
    const interval = setInterval(async () => {
      const s = performance.now();
      try {
        await fetch(selectedServer.traceUrl, { mode: 'no-cors', cache: 'no-store' });
        setLivePing(Math.round(performance.now() - s));
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, selectedServer]);

  const runTest = async (type: 'DOWNLOAD' | 'UPLOAD') => {
    setPhase(type === 'DOWNLOAD' ? TestPhase.DOWNLOAD : TestPhase.UPLOAD);
    const start = performance.now();
    const threadLoads = new Array(TEST_CONFIG.THREADS).fill(0);
    const samples: number[] = [];
    const activeRequests: XMLHttpRequest[] = [];
    
    // Large upload payload for accuracy
    const uploadChunk = new Uint8Array(4 * 1024 * 1024);

    const updateUI = () => {
      const now = performance.now();
      const elapsed = now - start;
      const currentProgress = Math.min((elapsed / TEST_CONFIG.DURATION) * 100, 100);
      setProgress(currentProgress);

      if (elapsed > TEST_CONFIG.RAMP_UP) {
        const totalBytes = threadLoads.reduce((a, b) => a + b, 0);
        const mbps = (totalBytes * 8) / (elapsed * 1000);
        samples.push(mbps);
        setGaugeValue(mbps);
        if (type === 'DOWNLOAD') setDownloadSpeed(mbps); else setUploadSpeed(mbps);
      }

      if (elapsed < TEST_CONFIG.DURATION) {
        requestAnimationFrame(updateUI);
      }
    };

    requestAnimationFrame(updateUI);

    const spawnThread = (id: number) => {
      return new Promise<void>((resolve) => {
        const loop = () => {
          const now = performance.now();
          if (now - start >= TEST_CONFIG.DURATION) {
            resolve();
            return;
          }

          const xhr = new XMLHttpRequest();
          activeRequests.push(xhr);
          const url = `${type === 'DOWNLOAD' ? selectedServer.downloadUrl : selectedServer.uploadUrl}?t=${Date.now()}&w=${id}`;
          
          xhr.open(type === 'DOWNLOAD' ? 'GET' : 'POST', url, true);
          
          let lastLoaded = 0;
          const onProgress = (e: ProgressEvent) => {
            const currentNow = performance.now();
            if (currentNow - start >= TEST_CONFIG.DURATION) {
              xhr.abort();
              return;
            }
            const delta = e.loaded - lastLoaded;
            threadLoads[id] += delta;
            lastLoaded = e.loaded;
          };

          if (type === 'DOWNLOAD') {
            xhr.onprogress = onProgress;
          } else {
            xhr.upload.onprogress = onProgress;
          }

          xhr.onload = xhr.onerror = xhr.onabort = () => {
            if (performance.now() - start < TEST_CONFIG.DURATION) {
              loop();
            } else {
              resolve();
            }
          };

          if (type === 'UPLOAD') {
            xhr.send(uploadChunk);
          } else {
            xhr.send();
          }
        };
        loop();
      });
    };

    await Promise.all(Array.from({ length: TEST_CONFIG.THREADS }).map((_, i) => spawnThread(i)));
    activeRequests.forEach(xhr => xhr.abort());

    if (samples.length === 0) return 0;
    // Accuracy strategy: discard extremes, use mid-to-high percentile for "stable peak"
    const sorted = samples.sort((a, b) => a - b);
    const validSamples = sorted.slice(Math.floor(sorted.length * 0.3), Math.floor(sorted.length * 0.9));
    return validSamples.length > 0 ? validSamples.reduce((a, b) => a + b, 0) / validSamples.length : sorted[sorted.length - 1];
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
    for(let i=0; i<10; i++) {
      const s = performance.now();
      try { 
        await fetch(selectedServer.traceUrl, { mode: 'no-cors', cache: 'no-store' }); 
        pings.push(performance.now() - s); 
      } catch { pings.push(999); }
      await new Promise(r => setTimeout(r, 100));
    }
    const sortedPings = pings.sort((a,b) => a - b);
    const avgPing = Math.round(sortedPings.slice(0, 5).reduce((a,b) => a+b, 0) / 5);
    setPing(avgPing);
    setJitter(Math.round(sortedPings[sortedPings.length - 1] - sortedPings[0]));

    const dl = await runTest('DOWNLOAD');
    setDownloadSpeed(dl);
    setPhase(TestPhase.TRANSITION);
    setGaugeValue(0);
    await new Promise(r => setTimeout(r, 1500));

    const ul = await runTest('UPLOAD');
    setUploadSpeed(ul);
    
    setPhase(TestPhase.COMPLETE);
    setGaugeValue(0);
    setShowResultOverlay(true);

    const result: TestResult = {
      id: Date.now(),
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
      download: dl,
      upload: ul,
      ping: avgPing,
      jitter: Math.round(sortedPings[sortedPings.length - 1] - sortedPings[0])
    };
    setHistory(prev => {
      const next = [result, ...prev].slice(0, 20);
      localStorage.setItem('velocity_v2_history', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 selection:bg-blue-500/30">
      <style>{`
        @keyframes pulse-intense {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); transform: scale(1); }
          50% { box-shadow: 0 0 30px 10px rgba(59, 130, 246, 0.1); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); transform: scale(1); }
        }
        @keyframes ping-slow {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes ping-slower {
          0% { transform: scale(0.6); opacity: 0.4; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .animate-pulse-cta { animation: pulse-intense 2s infinite ease-in-out; }
        .animate-ping-slow { animation: ping-slow 2s infinite linear; }
        .animate-ping-slower { animation: ping-slower 3s infinite linear; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      {showResultOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="glass w-full max-w-4xl rounded-[3rem] p-8 md:p-14 text-center relative animate-in zoom-in-95 duration-700 border-white/5">
            <button onClick={() => setShowResultOverlay(false)} className="absolute top-10 right-10 opacity-40 hover:opacity-100 transition-opacity"><i className="fa-solid fa-xmark text-2xl"></i></button>
            <div className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce">
               <i className="fa-solid fa-chart-line text-blue-400 text-4xl"></i>
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-12 uppercase tracking-tighter">Diagnostic Report</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <div className="glass p-10 rounded-[2.5rem] bg-blue-500/5 border-blue-500/20">
                <div className="text-xs opacity-40 uppercase mb-3 font-bold tracking-[0.3em]">Download Peak</div>
                <div className="text-6xl font-black text-blue-400 tabular-nums">{downloadSpeed.toFixed(1)}</div>
                <div className="text-xs opacity-20 mt-3 font-bold">MBPS / STABLE</div>
              </div>
              <div className="glass p-10 rounded-[2.5rem] bg-purple-500/5 border-purple-500/20">
                <div className="text-xs opacity-40 uppercase mb-3 font-bold tracking-[0.3em]">Upload Peak</div>
                <div className="text-6xl font-black text-purple-400 tabular-nums">{uploadSpeed.toFixed(1)}</div>
                <div className="text-xs opacity-20 mt-3 font-bold">MBPS / STABLE</div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-5 max-w-2xl mx-auto">
              <button onClick={startTest} className="flex-[3] py-6 bg-blue-600 rounded-3xl font-black uppercase tracking-[0.3em] text-sm shadow-2xl shadow-blue-600/30 animate-pulse-cta hover:bg-blue-500 transition-all">
                Re-test Speed
              </button>
              <button onClick={() => setShowResultOverlay(false)} className="flex-1 py-6 glass border-white/10 rounded-3xl font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-all">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="w-full max-w-6xl flex justify-between items-center py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-600/50">
            <i className="fa-solid fa-bolt-lightning text-white text-xl md:text-2xl"></i>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase leading-none">Velocity</h1>
            <span className="text-[10px] font-bold opacity-30 tracking-[0.4em] block mt-1">NATIVE CORE V3</span>
          </div>
        </div>
        <button onClick={() => setShowHistory(!showHistory)} className="w-12 h-12 rounded-2xl glass flex items-center justify-center hover:bg-white/10 transition-all">
          <i className={`fa-solid ${showHistory ? 'fa-xmark' : 'fa-clock-rotate-left'} text-lg`}></i>
        </button>
      </header>

      <main className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center py-8 gap-8 md:gap-16">
        {showHistory ? (
          <div className="w-full max-w-2xl glass rounded-[3rem] p-10 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-tight">Diagnostic Logs</h2>
              <button onClick={() => { localStorage.removeItem('velocity_v2_history'); setHistory([]); }} className="text-xs opacity-30 uppercase font-bold hover:opacity-100 transition-opacity">Clear Logs</button>
            </div>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
              {history.length > 0 ? history.map((h) => (
                <div key={h.id} className="flex justify-between items-center glass p-6 rounded-3xl text-[12px] border-white/5 hover:border-white/10 transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold opacity-80">{h.date}</span>
                    <span className="opacity-30 uppercase text-[9px] font-black tracking-widest">{selectedServer.name}</span>
                  </div>
                  <div className="flex gap-8 font-black text-sm">
                    <span className="text-blue-400">{h.download.toFixed(1)} <span className="opacity-30 text-[9px] ml-1">DL</span></span>
                    <span className="text-purple-400">{h.upload.toFixed(1)} <span className="opacity-30 text-[9px] ml-1">UL</span></span>
                    <span className="opacity-50">{h.ping}ms</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-24">
                  <i className="fa-solid fa-database opacity-10 text-6xl mb-4"></i>
                  <p className="opacity-20 text-sm font-bold uppercase tracking-widest">No history recorded</p>
                </div>
              )}
            </div>
            <button onClick={() => setShowHistory(false)} className="w-full mt-10 py-5 glass border-white/10 rounded-3xl font-bold uppercase text-[11px] hover:bg-white/5 transition-colors tracking-[0.3em]">Return Dashboard</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row items-center gap-12 md:gap-16 w-full">
              <div className="order-2 lg:order-1 w-full lg:w-1/4">
                <StatsCard 
                  label="Download" 
                  value={downloadSpeed} 
                  unit="Mbps" 
                  active={phase === TestPhase.DOWNLOAD} 
                  icon="fa-arrow-down-wide-short" 
                  colorClass="text-blue-400" 
                  activeGlow="ring-blue-500/50"
                />
              </div>
              <div className="order-1 lg:order-2 flex flex-col items-center gap-10 w-full lg:w-2/4">
                <SpeedGauge value={gaugeValue} phase={phase} progress={progress} />
                <button 
                  onClick={startTest} 
                  disabled={phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE} 
                  className={`px-16 py-7 bg-blue-600 hover:bg-blue-500 rounded-[2.5rem] font-black text-2xl tracking-[0.3em] shadow-[0_20px_60px_-15px_rgba(59,130,246,0.5)] active:scale-95 transition-all disabled:opacity-10 ${(phase === TestPhase.IDLE || phase === TestPhase.COMPLETE) ? 'animate-pulse-cta' : ''}`}
                >
                  {phase === TestPhase.IDLE || phase === TestPhase.COMPLETE ? 'LAUNCH' : 'BENCHMARKING'}
                </button>
              </div>
              <div className="order-3 lg:order-3 w-full lg:w-1/4">
                <StatsCard 
                  label="Upload" 
                  value={uploadSpeed} 
                  unit="Mbps" 
                  active={phase === TestPhase.UPLOAD} 
                  icon="fa-arrow-up-wide-short" 
                  colorClass="text-purple-400" 
                  activeGlow="ring-purple-500/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 w-full max-w-5xl">
              <NetworkInfo icon="fa-stopwatch" label="Latency" value={`${phase === TestPhase.IDLE ? livePing : ping} ms`} highlight />
              <NetworkInfo icon="fa-signal" label="Jitter" value={`${jitter} ms`} highlight />
              <div className="glass px-4 py-3 rounded-2xl flex flex-col gap-1">
                <div className="flex items-center gap-1.5 opacity-40">
                  <i className="fa-solid fa-globe text-[9px]"></i>
                  <span className="text-[9px] font-bold tracking-widest uppercase">Endpoint</span>
                </div>
                <select 
                  value={selectedServer.id} 
                  onChange={(e) => setSelectedServer(SERVERS.find(s => s.id === e.target.value) || SERVERS[0])} 
                  className="bg-transparent text-sm font-bold outline-none cursor-pointer appearance-none truncate opacity-80"
                >
                  {SERVERS.map(s => <option key={s.id} value={s.id} className="bg-neutral-900 text-white">{s.name}</option>)}
                </select>
              </div>
              <NetworkInfo icon="fa-wifi" label="Provider" value={provider} />
            </div>
          </>
        )}
      </main>

      <footer className="w-full max-w-6xl py-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center opacity-30 text-[9px] font-black uppercase tracking-[0.4em] gap-6 text-center">
        <span>EST. 2025 VELOCITY NETWORK CORE • ADVANCED TELEMETRY</span>
        <div className="flex gap-8">
          <button className="hover:text-white transition-colors">Privacy protocol</button>
          <button className="hover:text-white transition-colors">Terminal Terms</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
