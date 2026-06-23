import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, Play, Pause, RotateCcw } from 'lucide-react';
import { useState } from 'react';

const SignalControl = () => {
  const [autoMode, setAutoMode] = useState(true);
  const [signals, setSignals] = useState([
    { id: 'NS-1', name: 'North-South Main', status: 'green', timer: 45 },
    { id: 'EW-1', name: 'East-West Main', status: 'red', timer: 30 },
    { id: 'NS-2', name: 'North-South Secondary', status: 'green', timer: 40 },
    { id: 'EW-2', name: 'East-West Secondary', status: 'red', timer: 35 },
  ]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Signal Control</h1>
            <p className="text-gray-400 mt-1">Manage and monitor traffic signal operations</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={`px-4 py-2 ${
                autoMode
                  ? 'bg-green-500/20 text-green-300 border-green-500/50'
                  : 'bg-gray-600/20 text-gray-400 border-gray-600/50'
              }`}
            >
              <Radio className="mr-2 h-4 w-4" />
              {autoMode ? 'AUTO MODE' : 'MANUAL MODE'}
            </Badge>
            <Button
              onClick={() => setAutoMode(!autoMode)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {autoMode ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {autoMode ? 'Switch to Manual' : 'Enable Auto'}
            </Button>
          </div>
        </div>

        {/* Signal Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {signals.map((signal) => (
            <Card key={signal.id} className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg">{signal.name}</CardTitle>
                  <Badge
                    variant="secondary"
                    className={
                      signal.status === 'green'
                        ? 'bg-green-500/20 text-green-300 border-green-500/50'
                        : 'bg-red-500/20 text-red-300 border-red-500/50'
                    }
                  >
                    {signal.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Signal Lights */}
                  <div className="flex justify-center gap-4">
                    <div
                      className={`w-16 h-16 rounded-full border-4 ${
                        signal.status === 'red'
                          ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50'
                          : 'bg-gray-700 border-gray-600'
                      }`}
                    />
                    <div
                      className={`w-16 h-16 rounded-full border-4 ${
                        signal.status === 'green'
                          ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50'
                          : 'bg-gray-700 border-gray-600'
                      }`}
                    />
                  </div>

                  {/* Timer */}
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white">{signal.timer}s</div>
                    <p className="text-sm text-gray-400 mt-1">Time remaining</p>
                  </div>

                  {/* Controls */}
                  {!autoMode && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 border-green-600 text-green-400 hover:bg-green-600/20"
                      >
                        Set Green
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-red-600 text-red-400 hover:bg-red-600/20"
                      >
                        Set Red
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-gray-600 text-gray-400 hover:bg-gray-600/20"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* System Info */}
        <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Radio className="h-6 w-6 text-blue-300" />
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">Adaptive Signal Control</h3>
                <p className="text-sm text-gray-300">
                  AI-powered traffic light optimization adjusts timing based on real-time traffic conditions
                  and historical patterns to minimize congestion and improve flow efficiency.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SignalControl;
