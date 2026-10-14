import { useEffect, useState } from "react";
import type { Discovered } from "../../api";
import { Icon } from "../../ui/Icon";

/** How long the backend scans. It answers once, at the end, so progress is the elapsed share of this. */
/** What the wizard remembers about the tapped device: `[id, name]` as JSON, since Android ids are MAC addresses full of colons. */
export const deviceChoice = (d: { id: string; name: string | null }) => JSON.stringify([d.id, d.name || ""]);

export const SCAN_SECS = 8;

/** 0-100 while `active`: elapsed share of `secs`, held at 99 until the scan really answers. */
export function useScanProgress(active: boolean, secs: number): number {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!active) return;
    setPct(0);
    const start = performance.now();
    const id = setInterval(() => {
      setPct(Math.min(99, ((performance.now() - start) / (secs * 1000)) * 100));
    }, 100);
    return () => clearInterval(id);
  }, [active, secs]);
  return active ? pct : 100;
}

export default function WizardScan({
  onScan,
  value,
  onChoose,
}: {
  onScan: () => Promise<Discovered[]>;
  value: string | null;
  onChoose: (choice: string) => void;
}) {
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [loading, setLoading] = useState(false);
  const pct = Math.round(useScanProgress(loading, SCAN_SECS));

  const handleScan = async () => {
    setLoading(true);
    const results = await onScan();
    setDiscovered(results);
    setLoading(false);
  };

  useEffect(() => {
    void handleScan();
  }, []);

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {loading ? "Looking for nearby strips…" : "Which of these is your strip?"}
      </h1>
      <p className="muted wz-sub">
        {loading
          ? `Scanning takes about ${SCAN_SECS} seconds.`
          : "Tap your strip to continue. The one with the strongest signal is usually the closest."
        }
      </p>

      <div className="scan" data-od-id="wz-scan">
        <div className="scan-head">
          <span className="tnum" aria-live="polite">
            {loading ? `Scanning · ${discovered.length} found` : `Scan complete · ${discovered.length} devices`}
          </span>
          {loading ? (
            <span className="muted tnum">{pct}%</span>
          ) : (
            <button className="btn btn-ghost btn-tight" onClick={handleScan}>
              <Icon name="refresh" size="sm" />
              Scan again
            </button>
          )}
        </div>

        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Scan progress">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>

        {!loading && discovered.length === 0 && (
          <p className="muted t-12">No strips found. Turn on the strip, move the device closer, and scan again.</p>
        )}

        <ul className="devices" role="radiogroup" aria-label="Which of these is your strip?">
          {discovered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="device"
                role="radio"
                aria-checked={value === deviceChoice(d)}
                onClick={() => onChoose(deviceChoice(d))}
                data-od-id={`device-${d.name?.toLowerCase()}`}
              >
                <span className="orb sm" aria-hidden="true">
                  <Icon name="bt" size="sm" />
                </span>
                <span className="device-txt">
                  <span className="mono strong">{d.name || `[${d.id}]`}</span>
                  <span className="muted t-12">Advertised name</span>
                </span>
                <span className="sig">
                  {d.rssi !== null && (
                    <>
                      <svg className="bars" viewBox="0 0 20 13" aria-hidden="true">
                        {[0, 5, 10, 15].map((x, i) => {
                          const strength = d.rssi! + 100;
                          const threshold = [30, 50, 70, 90][i];
                          return (
                            <rect
                              key={i}
                              x={x}
                              y={13 - (i + 1) * 3}
                              width="3"
                              height={(i + 1) * 3}
                              className={strength >= threshold ? "on" : ""}
                            />
                          );
                        })}
                      </svg>
                      <span className="mono muted">{d.rssi} dBm</span>
                    </>
                  )}
                </span>
                <Icon name="chevR" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
