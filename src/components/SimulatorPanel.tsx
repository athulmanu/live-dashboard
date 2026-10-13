import { memo, useState } from 'react';
import { useLiveStreamContext } from '../hooks/useLiveStream';
import type { Simulator } from '../services/transports';

/** Fault injection for the simulated feed, to demonstrate resilience on demand. */
function SimulatorPanelImpl({ simulator }: { simulator: Simulator }) {
  const { store } = useLiveStreamContext();
  const [hostile, setHostile] = useState(false);

  return (
    <section className="panel simulator-panel" aria-label="Stress test controls">
      <div className="panel-header">
        <div>
          <h2>Stress test</h2>
          <p className="panel-sub">Inject load, network faults and hostile data into the simulated feed</p>
        </div>
      </div>
      <div className="sim-groups">
        <div className="sim-group">
          <h3>Load</h3>
          <div className="sim-actions">
            <button type="button" className="btn" onClick={() => simulator.burst()}>
              Burst 2k msg/s for 5s
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => store.clear()}>
              Clear buffer
            </button>
          </div>
        </div>

        <div className="sim-group">
          <h3>Network</h3>
          <div className="sim-actions">
            <button type="button" className="btn" onClick={() => simulator.dropConnection()}>
              Drop connection
            </button>
            <button type="button" className="btn" onClick={() => simulator.failNextConnections(3)}>
              Flap (fail 3 retries)
            </button>
            <button type="button" className="btn btn-danger" onClick={() => simulator.failNextConnections(100)}>
              Kill feed
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                simulator.restore();
                store.retry();
              }}
            >
              Restore feed
            </button>
          </div>
        </div>

        <div className="sim-group">
          <h3>Data</h3>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={hostile}
              onChange={(e) => {
                setHostile(e.target.checked);
                simulator.setHostile(e.target.checked);
              }}
            />
            <span className="switch-track" aria-hidden="true" />
            Hostile data (malformed + XSS payloads)
          </label>
        </div>
      </div>
    </section>
  );
}

export const SimulatorPanel = memo(SimulatorPanelImpl);
