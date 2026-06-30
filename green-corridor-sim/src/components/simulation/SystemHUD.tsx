import type { Direction } from '@/simulation/TrafficController';
import { useNavigate } from 'react-router-dom';

interface SystemHUDProps {
  mode: string;
  nsSignal: string;
  ewSignal: string;
  ambulanceActive: boolean;
  flowRate: number;
  onSpawnAmbulance: (dir: Direction) => void;
}

export function SystemHUD({ mode, nsSignal, ewSignal, ambulanceActive, flowRate, onSpawnAmbulance }: SystemHUDProps) {
  const isEmergency = mode === 'emergency';
  const navigate = useNavigate();
  const signalClass = (signal: string) => {
    if (signal === 'green') return 'text-signal-green glow-green';
    if (signal === 'yellow') return 'text-amber-300';
    return 'text-signal-red glow-red';
  };

  return (
    <>
      {/* Bottom controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-auto">
        <button
          onClick={() => onSpawnAmbulance('NS')}
          className={`text-system px-4 py-2 border bg-card/80 backdrop-blur-sm transition-colors hover:border-destructive hover:text-destructive ${
            ambulanceActive
              ? 'border-amber-500/60 text-amber-400'
              : 'border-border text-foreground'
          }`}
        >
          {ambulanceActive ? 'PREEMPT_NS' : 'DISPATCH_NS'}
        </button>
        <button
          onClick={() => onSpawnAmbulance('EW')}
          className={`text-system px-4 py-2 border bg-card/80 backdrop-blur-sm transition-colors hover:border-destructive hover:text-destructive ${
            ambulanceActive
              ? 'border-amber-500/60 text-amber-400'
              : 'border-border text-foreground'
          }`}
        >
          {ambulanceActive ? 'PREEMPT_EW' : 'DISPATCH_EW'}
        </button>
        {/* <button
          onClick={() => navigate('/traffic')}
          className="text-system px-4 py-2 border border-border bg-card/80 backdrop-blur-sm text-foreground hover:border-purple-500 hover:text-purple-400 transition-colors"
        >
          TRAFFIC
        </button>
        <button
          onClick={() => navigate('/ml-dataset')}
          className="text-system px-4 py-2 border border-border bg-card/80 backdrop-blur-sm text-foreground hover:border-blue-500 hover:text-blue-400 transition-colors"
        >
          ML_DATASET
        </button> */}
      </div>

      {/* Emergency banner */}
      {isEmergency && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <p className="text-system text-2xl font-bold text-destructive glow-red animate-pulse tracking-[0.3em]">
            EMERGENCY_DETECTED
          </p>
          <p className="text-system text-center text-emergency-blue glow-blue mt-1">
            CORRIDOR_ACTIVE
          </p>
        </div>
      )}

      {/* Corner decoration
      <div className="absolute top-6 right-6 text-system text-muted-foreground text-right pointer-events-none select-none bg-card/85 backdrop-blur-sm p-3 rounded-sm border border-border">
        <p>CTC_v2.1</p>
        <p className="text-[10px] mt-1">INTERSECTION_ALPHA</p>
      </div> */}
    </>
  );
}
