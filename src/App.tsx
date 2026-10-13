import { ConnectionBar } from './components/ConnectionBar';
import { Dashboard } from './components/Dashboard';
import { PulseIcon } from './components/Icons';
import { SimulatorPanel } from './components/SimulatorPanel';
import { LiveStreamContext, useLiveStream } from './hooks/useLiveStream';

export default function App() {
  const stream = useLiveStream();

  return (
    <LiveStreamContext.Provider value={stream}>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <PulseIcon />
            </span>
            <div>
              <h1>Live Monitoring</h1>
              <p className="muted">Real-time service health and events</p>
            </div>
          </div>
          <span className="source-pill">{stream.simulator ? 'Simulated feed' : 'WebSocket feed'}</span>
        </header>
        <ConnectionBar />
        <main className="content">
          <Dashboard />
          {stream.simulator && <SimulatorPanel simulator={stream.simulator} />}
        </main>
      </div>
    </LiveStreamContext.Provider>
  );
}
