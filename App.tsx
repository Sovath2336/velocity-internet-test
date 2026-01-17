
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import SpeedGauge from './components/SpeedGauge';
import StatsCard from './components/StatsCard';
import NetworkInfo from './components/NetworkInfo';

// Gemini API Initialization
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

interface Server {
  id: string;
  name: string;
  location: string;
  regionCode: string;
  regionColor: string;
  downloadUrl: string;
  uploadUrl: string;
  traceUrl: string;
}

const SERVERS: Server[] = [
  {
    id: 'cloudflare-global',
    name: 'Cloudflare Edge',
    location: 'Global Anycast',
    regionCode: '🌐',
    regionColor: 'bg-blue-400',
    downloadUrl: 'https://speed.cloudflare.com/__down?bytes=50000000',
    uploadUrl: 'https://speed.cloudflare.com/__up',
    traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace'
  },
  {
    id: 'google-global',
    name: 'Google Infrastructure',
    location: 'US East',
    regionCode: '🇺🇸',
    regionColor: 'bg-red-400',
    downloadUrl: 'https://storage.googleapis.com/connectivity-test-assets/test-100mb.bin',
    uploadUrl: 'https://httpbin.org/post',
    traceUrl: 'https://www.google.com/generate_204'
  }
];

const TEST_DURATION_MS = 8000; 
const CONCURRENT_STREAMS = 4;
const RAMP_UP_THRESHOLD_MS = 1200; 

enum TestPhase {
  IDLE = 'IDLE',
  PING = 'PING',
  DOWNLOAD = 'DOWNLOAD',
  TRANSITION = 'TRANSITION',
  UPLOAD = 'UPLOAD',
  COMPLETE = 'COMPLETE'
}

interface DataPoint {
  time: number;
  value: number;
}

interface TestResult {
  id: string;
  date: string;
  download: number;
  upload: number;
  ping: number;
  jitter: number;
}

const App: React.FC = () => {
  const [phase, setPhase] = useState<TestPhase>(TestPhase.IDLE);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [livePing, setLivePing] = useState<number>(0);
  const [liveJitter, setLiveJitter] = useState<number>(0);
  const [jitter, setJitter] = useState<number>(0);
  const [downloadHistory, setDownloadHistory] = useState<DataPoint[]>([]);
  const [uploadHistory, setUploadHistory] = useState<DataPoint[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [provider, setProvider] = useState<string>("Detecting...");
  const [selectedServer, setSelectedServer] = useState<Server>(SERVERS[0]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [history, setHistory] = useState<TestResult[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [gaugeValue, setGaugeValue] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sharedResult, setSharedResult] = useState<TestResult | null>(null);
  const [footerSection, setFooterSection] = useState<string | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState<boolean>(false);

  const gaugeRef = useRef(0);
  const lastHistoryUpdateRef = useRef(0);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#result=')) {
      try {
        const encoded = hash.split('#result=')[1];
        const decoded = JSON.parse(atob(encoded));
        setSharedResult(decoded);
      } catch (e) {
        console.error("Failed to parse shared result");
      }
    }

    const saved = localStorage.getItem('velocity_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch (e) {}
    
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => setProvider(data.org || "Unknown ISP"))
      .catch(() => setProvider("Unknown ISP"));
  }, []);

  const saveToHistory = useCallback((res: TestResult) => {
    setHistory(prev => {
      const updated = [res, ...prev].slice(0, 15);
      localStorage.setItem('velocity_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const shareResult = async () => {
    const currentResult: TestResult = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      download: downloadSpeed,
      upload: uploadSpeed,
      ping: ping,
      jitter: jitter
    };
    const encoded = btoa(JSON.stringify(currentResult));
    const shareUrl = `${window.location.origin}${window.location.pathname}#result=${encoded}`;
    const shareText = `My Speed Test Result: Download: ${downloadSpeed.toFixed(1)} Mbps, Upload: ${uploadSpeed.toFixed(1)} Mbps, Latency: ${ping} ms. Check it out on Velocity!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Velocity Speed Test Result',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // user cancelled or error
        console.debug("Share failed or cancelled", err);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setToastMessage("RESULT LINK COPIED TO CLIPBOARD");
        setTimeout(() => setToastMessage(null), 3000);
      } catch (err) {
        console.error("Clipboard copy failed", err);
      }
    }
  };

  const closeSharedView = () => {
    setSharedResult(null);
    window.location.hash = '';
  };

  const updateGaugeSmoothly = useCallback((target: number) => {
    gaugeRef.current = target;
    requestAnimationFrame(() => {
      setGaugeValue(target);
    });
  }, []);

  useEffect(() => {
    let interval: number;
    let lastP = 0;
    const tick = async () => {
      if (phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE) return;
      if (sharedResult || footerSection) return;
      const s = performance.now();
      try {
        await fetch(selectedServer.traceUrl, { 
          mode: 'no-cors', 
          cache: 'no-store',
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' }
        });
        const p = Math.round(performance.now() - s);
        const j = lastP > 0 ? Math.abs(p - lastP) : 0;
        lastP = p;
        setLivePing(p);
        setLiveJitter(j);
        setIsConnected(true);
      } catch { 
        setIsConnected(false); 
      }
    };
    tick();
    interval = window.setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [phase, selectedServer, sharedResult, footerSection]);

  const runDownloadTest = async (server: Server) => {
    setPhase(TestPhase.DOWNLOAD);
    const testStart = performance.now();
    let totalBytes = 0;
    let samples: number[] = [];
    const controller = new AbortController();
    
    const timeout = setTimeout(() => controller.abort(), TEST_DURATION_MS);

    const stream = async () => {
      let reader;
      try {
        const url = `${server.downloadUrl}${server.downloadUrl.includes('?') ? '&' : '?'}cb=${Date.now()}`;
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        reader = res.body?.getReader();
        if (!reader) return;

        while (true) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) break;
          totalBytes += value.length;
          
          const now = performance.now();
          const elapsed = now - testStart;
          
          if (now - lastHistoryUpdateRef.current > 50) {
            setProgress(Math.min((elapsed / TEST_DURATION_MS) * 100, 100));
            if (elapsed > RAMP_UP_THRESHOLD_MS) {
              const mbps = (totalBytes * 8) / (elapsed * 1000);
              samples.push(mbps);
              setDownloadSpeed(mbps);
              updateGaugeSmoothly(mbps);
              
              if (now - lastHistoryUpdateRef.current > 200) {
                setDownloadHistory(prev => [...prev.slice(-30), { time: now, value: mbps }]);
                lastHistoryUpdateRef.current = now;
              }
            }
          }
        }
      } catch (e) {
      } finally {
        if (reader) {
          try { await reader.cancel(); } catch(e) {}
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENT_STREAMS }).map(() => stream()));
    clearTimeout(timeout);
    return samples.length > 0 ? samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.8)] : 0;
  };

  const runUploadTest = async (server: Server) => {
    setPhase(TestPhase.UPLOAD);
    updateGaugeSmoothly(0);
    setProgress(0);
    const testStart = performance.now();
    let totalBytesUploaded = 0;
    let samples: number[] = [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_DURATION_MS);

    const totalSize = 1024 * 1024;
    const data = new Uint8Array(totalSize);
    const chunkSize = 65536;
    for (let i = 0; i < totalSize; i += chunkSize) {
      const end = Math.min(i + chunkSize, totalSize);
      crypto.getRandomValues(data.subarray(i, end));
    }
    const blob = new Blob([data], { type: 'application/octet-stream' });

    const uploadWorker = async () => {
      while (performance.now() - testStart < TEST_DURATION_MS && !controller.signal.aborted) {
        try {
          await fetch(`${server.uploadUrl}?cb=${Date.now()}`, {
            method: 'POST',
            body: blob,
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller.signal
          });
          totalBytesUploaded += blob.size;
          const now = performance.now();
          const elapsed = now - testStart;
          
          if (now - lastHistoryUpdateRef.current > 50) {
            if (elapsed > RAMP_UP_THRESHOLD_MS) {
              const mbps = (totalBytesUploaded * 8) / (elapsed * 1000);
              samples.push(mbps);
              setUploadSpeed(mbps);
              updateGaugeSmoothly(mbps);
              
              if (now - lastHistoryUpdateRef.current > 200) {
                setUploadHistory(prev => [...prev.slice(-30), { time: now, value: mbps }]);
                lastHistoryUpdateRef.current = now;
              }
            }
            setProgress(Math.min((elapsed / TEST_DURATION_MS) * 100, 100));
          }
        } catch (e) { 
          if (e.name === 'AbortError') break;
          await new Promise(r => requestAnimationFrame(r));
        }
      }
    };

    await Promise.all(Array.from({ length: 4 }).map(() => uploadWorker()));
    clearTimeout(timeout);
    return samples.length > 0 ? samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.8)] : 0;
  };

  const startTest = async () => {
    if (phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE) return;
    setShowResultOverlay(false);

    try {
      setPhase(TestPhase.PING);
      setDownloadSpeed(0);
      setUploadSpeed(0);
      updateGaugeSmoothly(0);
      setProgress(0);
      setDownloadHistory([]);
      setUploadHistory([]);
      lastHistoryUpdateRef.current = performance.now();

      const serverToUse = selectedServer;

      const pings = [];
      for (let i = 0; i < 6; i++) {
        const s = performance.now();
        try {
          await fetch(serverToUse.traceUrl, { mode: 'no-cors', cache: 'no-store' });
          pings.push(performance.now() - s);
        } catch { pings.push(999); }
        await new Promise(r => setTimeout(r, 150));
      }
      const sortedPings = pings.sort((a,b) => a-b).slice(1, -1);
      const avgPing = Math.round(sortedPings.reduce((a, b) => a + b, 0) / sortedPings.length);
      const avgJitter = Math.round(Math.max(...sortedPings) - Math.min(...sortedPings));
      setPing(avgPing);
      setJitter(avgJitter);

      const finalDl = await runDownloadTest(serverToUse);
      setDownloadSpeed(finalDl);

      setPhase(TestPhase.TRANSITION);
      setProgress(100);
      updateGaugeSmoothly(0);
      await new Promise(r => setTimeout(r, 1200));

      const finalUl = await runUploadTest(serverToUse);
      setUploadSpeed(finalUl);

      updateGaugeSmoothly(0);
      setPhase(TestPhase.COMPLETE);
      setProgress(100);
      setShowResultOverlay(true);

      saveToHistory({
        id: Date.now().toString(),
        date: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        download: finalDl,
        upload: finalUl,
        ping: avgPing,
        jitter: avgJitter
      });
    } catch (e) {
      console.error("Critical test failure:", e);
      setPhase(TestPhase.IDLE);
    }
  };

  const renderFooterContent = () => {
    switch(footerSection) {
      case 'privacy':
        return (
          <div className="w-full max-w-4xl glass rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4">Privacy Policy</h2>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <p>At Velocity Core, we prioritize your digital sovereignty. Our platform is built for transparency and user privacy.</p>
              <p><strong>Data Minimization:</strong> We do not store persistent logs of your IP address. Tests are stateless, and history data stays exclusively in your browser's local storage.</p>
              <p><strong>Secure Testing:</strong> All test streams occur over encrypted HTTPS channels. We utilize industry-standard edge nodes to prevent data interception during throughput measurements.</p>
            </div>
            <button onClick={() => setFooterSection(null)} className="mt-10 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all text-white">Return to Engine</button>
          </div>
        );
      case 'methodology':
        return (
          <div className="w-full max-w-4xl glass rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4">Test Methodology</h2>
            <div className="space-y-6 text-white/70 text-sm leading-relaxed">
              <section>
                <h3 className="text-white font-bold mb-2">Multi-Stream Technology</h3>
                <p>Velocity employs multiple parallel data streams to fully saturate your connection, overcoming common network overheads and providing a true reflection of your maximum bandwidth.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">Edge Precision</h3>
                <p>By leveraging global Anycast networks, we minimize the "middleman" delay. This ensures your results reflect your ISP's performance, not the speed of a single distant data center.</p>
              </section>
            </div>
            <button onClick={() => setFooterSection(null)} className="mt-10 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all text-white">Return to Engine</button>
          </div>
        );
      case 'enterprise':
        return (
          <div className="w-full max-w-4xl glass rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest border-b border-white/10 pb-4">Enterprise Infrastructure</h2>
            <div className="space-y-6 text-white/70 text-sm leading-relaxed">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                  <h4 className="text-blue-400 font-bold mb-2">Dedicated Endpoints</h4>
                  <p className="text-xs">Whitelist-ready testing nodes for corporate environments requiring strict security protocols.</p>
                </div>
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                  <h4 className="text-purple-400 font-bold mb-2">SLA Benchmarking</h4>
                  <p className="text-xs">Detailed telemetry reports for auditing ISP service level agreements across multi-branch deployments.</p>
                </div>
              </div>
            </div>
            <button onClick={() => setFooterSection(null)} className="mt-10 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all text-white">Return to Engine</button>
          </div>
        );
      default: return null;
    }
  };

  if (footerSection) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
        <header className="w-full max-w-6xl flex justify-between items-center py-6">
           <div className="flex items-center gap-3 cursor-pointer" onClick={() => setFooterSection(null)}>
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <i className="fa-solid fa-bolt-lightning text-white text-xl"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tighter uppercase text-white">Velocity</h1>
          </div>
        </header>
        <main className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center py-10">
          {renderFooterContent()}
        </main>
      </div>
    );
  }

  if (sharedResult) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
        <header className="w-full max-w-6xl flex justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.4)]">
              <i className="fa-solid fa-bolt-lightning text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter uppercase leading-none text-white">Velocity</h1>
              <span className="text-[10px] font-bold opacity-30 tracking-[0.2em] text-white">PRECISION ENGINE</span>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-4xl glass rounded-[2.5rem] p-10 flex flex-col items-center gap-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Shared Result</h2>
            <p className="opacity-40 text-xs font-bold uppercase tracking-widest">Snapshot from {sharedResult.date}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            <StatsCard label="DOWNLOAD" value={sharedResult.download} unit="Mbps" active={false} icon="fa-download" color="text-blue-400" />
            <StatsCard label="UPLOAD" value={sharedResult.upload} unit="Mbps" active={false} icon="fa-upload" color="text-purple-400" />
          </div>
          <div className="grid grid-cols-2 gap-8 w-full">
             <NetworkInfo icon="fa-clock" label="LATENCY" value={`${sharedResult.ping}ms`} highlight />
             <NetworkInfo icon="fa-wave-square" label="JITTER" value={`${sharedResult.jitter}ms`} highlight />
          </div>
          <button 
            onClick={closeSharedView}
            className="px-12 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white font-bold tracking-widest uppercase transition-all shadow-[0_0_40px_rgba(37,99,235,0.4)]"
          >
            Run Your Own Test
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      {/* Result Overlay Popup */}
      {showResultOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="relative w-full max-w-2xl glass rounded-[3rem] p-8 md:p-12 shadow-[0_0_100px_rgba(37,99,235,0.2)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <button 
              onClick={() => setShowResultOverlay(false)}
              className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
            >
              <i className="fa-solid fa-xmark text-2xl"></i>
            </button>

            <div className="flex flex-col items-center text-center gap-8">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                <i className="fa-solid fa-check text-white text-3xl"></i>
              </div>
              
              <div>
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Test Complete</h2>
                <p className="text-sm font-bold opacity-40 uppercase tracking-widest mt-1">Network Profile Confirmed</p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center gap-1 border-blue-500/20">
                  <span className="text-[10px] font-black opacity-40 tracking-widest uppercase">Download</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-blue-400">{downloadSpeed.toFixed(1)}</span>
                    <span className="text-[10px] opacity-40">Mbps</span>
                  </div>
                </div>
                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center gap-1 border-purple-500/20">
                  <span className="text-[10px] font-black opacity-40 tracking-widest uppercase">Upload</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-purple-400">{uploadSpeed.toFixed(1)}</span>
                    <span className="text-[10px] opacity-40">Mbps</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Latency</span>
                  <span className="text-lg font-bold text-green-400">{ping}ms</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Jitter</span>
                  <span className="text-lg font-bold text-yellow-400">{jitter}ms</span>
                </div>
              </div>

              <div className="flex flex-col w-full gap-4 mt-4">
                <button 
                  onClick={startTest}
                  className="w-full py-6 bg-blue-600 hover:bg-blue-500 rounded-[2rem] text-white font-black text-lg tracking-[0.2em] uppercase transition-all shadow-[0_20px_40px_rgba(37,99,235,0.3)]"
                >
                  Test Again
                </button>
                <button 
                  onClick={shareResult}
                  className="w-full py-4 glass hover:bg-white/10 rounded-[2rem] text-white font-bold text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-arrow-up-from-bracket"></i>
                  Share Result
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[110] glass px-6 py-3 rounded-2xl border-blue-500/50 border animate-in slide-in-from-top-4">
          <span className="text-xs font-bold tracking-widest text-blue-400">{toastMessage}</span>
        </div>
      )}
      
      <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center py-6 gap-6">
        <div className="flex items-center gap-3" onClick={() => window.location.reload()}>
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.4)] cursor-pointer">
            <i className="fa-solid fa-bolt-lightning text-white text-2xl"></i>
          </div>
          <div className="cursor-pointer">
            <h1 className="text-3xl font-bold tracking-tighter uppercase leading-none text-white">Velocity</h1>
            <span className="text-[10px] font-bold opacity-30 tracking-[0.2em] text-white">PRECISION ENGINE</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="glass px-4 py-2 rounded-full border border-white/10 flex items-center gap-3">
             <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'} animate-pulse`}></span>
             <select 
               value={selectedServer.id}
               onChange={(e) => setSelectedServer(SERVERS.find(s => s.id === e.target.value) || SERVERS[0])}
               className="bg-transparent text-xs font-bold opacity-60 uppercase border-none outline-none cursor-pointer text-white"
             >
               {SERVERS.map(s => <option key={s.id} value={s.id} className="bg-black text-white">{s.name}</option>)}
             </select>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="px-5 py-2 rounded-full border border-white/20 hover:bg-white/10 transition-all text-xs font-bold uppercase tracking-widest text-white"
          >
            History
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl flex flex-col items-center justify-center py-10 gap-12">
        {showHistory ? (
          <div className="w-full max-w-4xl glass rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
              <h2 className="text-2xl font-bold text-white">Testing Log</h2>
              <button onClick={() => { localStorage.removeItem('velocity_history'); setHistory([]); }} className="text-[10px] font-bold opacity-40 hover:opacity-100 uppercase tracking-widest text-white">Clear Records</button>
            </div>
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
              {history.length > 0 ? history.map((h) => (
                <div key={h.id} className="grid grid-cols-4 items-center glass p-5 rounded-2xl">
                  <div className="text-[10px] font-bold opacity-40 text-white">{h.date}</div>
                  <div className="text-blue-400 font-bold">{h.download.toFixed(1)} <span className="text-[8px] opacity-40">Mbps</span></div>
                  <div className="text-purple-400 font-bold">{h.upload.toFixed(1)} <span className="text-[8px] opacity-40">Mbps</span></div>
                  <div className="text-green-400 font-bold">{h.ping} <span className="text-[8px] opacity-40">ms</span></div>
                </div>
              )) : <div className="py-20 text-center opacity-30 italic text-white">No historical data available.</div>}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-10 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all text-white">Back</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 w-full items-center">
              <div className="flex flex-col gap-6 order-2 lg:order-1">
                <StatsCard label="DOWNLOAD" value={downloadSpeed} unit="Mbps" active={phase === TestPhase.DOWNLOAD} icon="fa-download" color="text-blue-400" />
                <div className="h-40 glass rounded-3xl overflow-hidden p-4 border border-white/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={downloadHistory}>
                      <defs>
                        <linearGradient id="colorDl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDl)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-10 order-1 lg:order-2">
                <SpeedGauge value={gaugeValue} phase={phase} progress={progress} />
                <div className="flex flex-col items-center gap-4">
                  <button 
                    onClick={startTest}
                    disabled={phase !== TestPhase.IDLE && phase !== TestPhase.COMPLETE}
                    className={`relative px-16 py-5 rounded-3xl font-black text-xl tracking-[0.2em] transition-all
                      ${phase === TestPhase.IDLE || phase === TestPhase.COMPLETE 
                        ? 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_50px_rgba(37,99,235,0.5)] active:scale-95' 
                        : 'bg-white/5 text-white/20 cursor-wait'}`}
                  >
                    {phase === TestPhase.IDLE ? 'START' : phase === TestPhase.COMPLETE ? 'AGAIN' : 'TESTING'}
                  </button>
                  {phase === TestPhase.COMPLETE && (
                    <button 
                      onClick={() => setShowResultOverlay(true)}
                      className="flex items-center gap-2 text-[10px] font-bold opacity-40 hover:opacity-100 uppercase tracking-widest transition-opacity py-2 text-white"
                    >
                      <i className="fa-solid fa-expand"></i>
                      View Summary
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6 order-3">
                <StatsCard label="UPLOAD" value={uploadSpeed} unit="Mbps" active={phase === TestPhase.UPLOAD} icon="fa-upload" color="text-purple-400" />
                <div className="h-40 glass rounded-3xl overflow-hidden p-4 border border-white/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={uploadHistory}>
                      <defs>
                        <linearGradient id="colorUl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c084fc" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#c084fc" fillOpacity={1} fill="url(#colorUl)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-4xl">
              <NetworkInfo icon="fa-clock" label="LATENCY" value={phase === TestPhase.IDLE || phase === TestPhase.COMPLETE ? `${livePing}ms` : `${ping}ms`} highlight />
              <NetworkInfo icon="fa-wave-square" label="JITTER" value={phase === TestPhase.IDLE || phase === TestPhase.COMPLETE ? `${liveJitter}ms` : `${jitter}ms`} highlight />
              <NetworkInfo icon="fa-server" label="SERVER" value={selectedServer.name} badge={selectedServer.regionCode} />
              <NetworkInfo icon="fa-wifi" label="ISP" value={provider} />
            </div>
          </>
        )}
      </main>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 text-sm opacity-60 mb-20 mt-10">
        <section className="glass p-8 rounded-[2rem] border border-white/5">
          <h3 className="font-black text-white mb-4 uppercase tracking-widest text-xs text-center md:text-left">Precision Core</h3>
          <p className="leading-relaxed text-white/80">Velocity Core utilizes multi-socket saturation to detect the theoretical maximum of your network pipe, bypassing local OS buffering delays.</p>
        </section>
        <section className="glass p-8 rounded-[2rem] border border-white/5">
          <h3 className="font-black text-white mb-4 uppercase tracking-widest text-xs text-center md:text-left">Anycast Density</h3>
          <p className="leading-relaxed text-white/80">Global tests route through the nearest Anycast node, ensuring low-latency handoffs and accurate jitter profiling for real-time applications.</p>
        </section>
        <section className="glass p-8 rounded-[2rem] border border-white/5">
          <h3 className="font-black text-white mb-4 uppercase tracking-widest text-xs text-center md:text-left">Live Telemetry</h3>
          <p className="leading-relaxed text-white/80">High-fidelity graphing provides insight into throughput stability, helping you identify packet loss or intermittent ISP throttling.</p>
        </section>
      </div>

      <footer className="w-full max-w-6xl py-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-10 opacity-40 text-[10px] font-bold uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <span className="text-white">&copy; 2025 VELOCITY CORE INFRASTRUCTURE</span>
          <span className="text-blue-500">Global Anycast Network</span>
        </div>
        <nav className="flex gap-10">
          <button onClick={() => setFooterSection('privacy')} className="hover:text-white transition-colors text-white uppercase tracking-widest">Privacy</button>
          <button onClick={() => setFooterSection('methodology')} className="hover:text-white transition-colors text-white uppercase tracking-widest">Methodology</button>
          <button onClick={() => setFooterSection('enterprise')} className="hover:text-white transition-colors text-white uppercase tracking-widest">Enterprise</button>
        </nav>
      </footer>
    </div>
  );
};

export default App;
