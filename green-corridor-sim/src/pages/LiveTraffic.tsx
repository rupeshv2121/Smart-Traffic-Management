import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CAMERA_STREAMS, DETECTION_CONFIG } from '@/config/cameraStreams';
import { Activity, AlertTriangle, Car, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Detection {
  bbox: [number, number, number, number];
  class: 'car' | 'emergency';
  confidence: number;
}

interface DetectionResult {
  detections: Detection[];
  summary: {
    cars: number;
    emergency: number;
    total: number;
  };
}

interface CameraFeed {
  id: number;
  name: string;
  streamUrl: string; // Camera stream URL
  detections: Detection[];
  summary: { cars: number; emergency: number; total: number };
  status: 'connecting' | 'active' | 'error';
}

const LiveTraffic = () => {
  const [statusText, setStatusText] = useState<string>('Initializing AI detection system...');
  const [isDetecting, setIsDetecting] = useState(DETECTION_CONFIG.autoStart);

  // Initialize camera feeds from configuration
  const [cameraFeeds, setCameraFeeds] = useState<CameraFeed[]>(
    CAMERA_STREAMS.map(stream => ({
      id: stream.id,
      name: stream.name,
      streamUrl: stream.streamUrl,
      detections: [],
      summary: { cars: 0, emergency: 0, total: 0 },
      status: 'connecting' as const
    }))
  );

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const overlayRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Track processing state per camera to handle frame skipping
  const processingRef = useRef<boolean[]>([false, false, false, false]);
  const frameSkipCountRef = useRef<number[]>([0, 0, 0, 0]);

  // Initialize webcam streams
  useEffect(() => {
    const initializeStreams = async () => {
      // For demo purposes, we'll use the same webcam for all 4 feeds
      // In production, replace this with actual camera stream URLs

      try {
        // Try to get webcam access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        // Apply stream to all video elements
        videoRefs.current.forEach((video, index) => {
          if (video) {
            video.srcObject = stream;
            video.play().then(() => {
              setCameraFeeds(prev => prev.map((feed, idx) =>
                idx === index ? { ...feed, status: 'active' as const } : feed
              ));
            }).catch(err => {
              console.error(`Error playing camera ${index + 1}:`, err);
              setCameraFeeds(prev => prev.map((feed, idx) =>
                idx === index ? { ...feed, status: 'error' as const } : feed
              ));
            });
          }
        });

        setStatusText('Cameras connected - AI detection active');
      } catch (err) {
        console.error('Error accessing webcam:', err);
        setStatusText('Error: Could not access camera. Please check permissions.');

        // Mark all as error
        setCameraFeeds(prev => prev.map(feed => ({ ...feed, status: 'error' as const })));
      }
    };

    initializeStreams();

    // Cleanup on unmount
    return () => {
      videoRefs.current.forEach(video => {
        if (video && video.srcObject) {
          const stream = video.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
        }
      });
    };
  }, []);

  // Automatic detection loop
  useEffect(() => {
    if (!isDetecting) return;

    // Wait for cameras to be ready
    const allReady = cameraFeeds.every(feed => feed.status === 'active');
    if (!allReady) {
      console.log('Waiting for cameras to be ready...');
      return;
    }

    console.log('Starting automatic YOLO detection...');
    setStatusText(`AI detection active - Processing frames every ${DETECTION_CONFIG.detectionInterval / 1000} seconds`);

    // Start periodic detection
    detectionIntervalRef.current = setInterval(() => {
      captureAndDetect();
    }, DETECTION_CONFIG.detectionInterval);

    // Initial detection after 1 second
    setTimeout(() => captureAndDetect(), 1000);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isDetecting, cameraFeeds]);

  const captureAndDetect = async () => {
    try {
      frameCountRef.current++;

      // Process each camera independently in parallel (frame skipping enabled)
      const detectionPromises = [0, 1, 2, 3].map(i => detectSingleCamera(i));

      // Wait for all parallel detections with timeout
      const results = await Promise.race([
        Promise.all(detectionPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Detection timeout')), DETECTION_CONFIG.detectionInterval - 500)
        )
      ]);

      // Update all detections
      if (Array.isArray(results)) {
        setCameraFeeds(prev =>
          prev.map((feed, idx) => {
            const result = results[idx];
            if (result?.success) {
              return {
                ...feed,
                detections: result.detections || [],
                summary: { cars: 0, emergency: 0, total: result.detections?.length || 0 }
              };
            }
            return feed;
          })
        );
        drawAllOverlays();
      }
    } catch (error) {
      console.error('Error in detection:', error);
      setStatusText(`Detection error at frame ${frameCountRef.current}`);
    }
  };

  const detectSingleCamera = async (cameraIndex: number): Promise<any> => {
    try {
      // Skip frame if still processing previous one
      if (processingRef.current[cameraIndex]) {
        frameSkipCountRef.current[cameraIndex]++;
        return { success: false, skipped: true };
      }

      const video = videoRefs.current[cameraIndex];
      const canvas = canvasRefs.current[cameraIndex];

      if (!video || !canvas || video.readyState < 2) {
        return { success: false };
      }

      processingRef.current[cameraIndex] = true;

      const ctx = canvas.getContext('2d');
      if (!ctx) return { success: false };

      // Set canvas size to match video
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob with REDUCED quality for speed
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', DETECTION_CONFIG.imageQuality);
      });

      if (!blob) {
        processingRef.current[cameraIndex] = false;
        return { success: false };
      }

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Get base64 without data URI prefix
        };
        reader.onerror = reject;
      });

      reader.readAsDataURL(blob);
      const base64Image = await base64Promise;

      // Send to backend for detection
      const response = await fetch(`${DETECTION_CONFIG.backendUrl}/api/yolo/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          intersection_id: `intersection_1`,
          lane_id: `lane_${cameraIndex + 1}`
        }),
      });

      if (!response.ok) {
        processingRef.current[cameraIndex] = false;
        return { success: false };
      }

      const data = await response.json();
      processingRef.current[cameraIndex] = false;

      if (data.success) {
        // Normalize detections to our format
        const normalizedDetections = (data.detections || []).map((d: any) => ({
          bbox: d.bbox,
          class: d.type === 'emergency' ? 'emergency' : 'car',
          confidence: d.confidence
        }));

        return {
          success: true,
          detections: normalizedDetections
        };
      }

      return { success: false };
    } catch (error) {
      processingRef.current[cameraIndex] = false;
      console.error(`Camera ${cameraIndex} detection error:`, error);
      return { success: false };
    }
  };

  const drawAllOverlays = () => {
    cameraFeeds.forEach((feed, idx) => {
      const overlayCanvas = overlayRefs.current[idx];
      const video = videoRefs.current[idx];

      if (!overlayCanvas || !video || !feed.detections) return;

      const ctx = overlayCanvas.getContext('2d');
      if (!ctx) return;

      // Match overlay size to video display size
      const rect = video.getBoundingClientRect();
      overlayCanvas.width = video.videoWidth || rect.width;
      overlayCanvas.height = video.videoHeight || rect.height;

      // Clear previous drawings
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      // Draw bounding boxes
      feed.detections.forEach((detection) => {
        const [x1, y1, x2, y2] = detection.bbox;
        const color = detection.class === 'emergency' ? '#FF0000' : '#00FF00';
        const label = detection.class === 'emergency' ? 'EMERGENCY' : 'CAR';

        // Draw rectangle
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Draw filled label background
        ctx.fillStyle = color;
        const textWidth = ctx.measureText(label).width + 10;
        ctx.fillRect(x1, y1 > 30 ? y1 - 30 : y1, textWidth, 25);

        // Draw label text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(label, x1 + 5, y1 > 30 ? y1 - 8 : y1 + 18);

        // Draw confidence
        ctx.fillStyle = color;
        ctx.font = '14px Arial';
        ctx.fillText(`${(detection.confidence * 100).toFixed(1)}%`, x1 + 5, y2 - 5);
      });

      // Draw camera label and stats overlay
      const overlayHeight = 100;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, 350, overlayHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(feed.name, 15, 35);

      ctx.font = '18px Arial';
      ctx.fillText(`Cars: ${feed.summary.cars}`, 15, 65);

      const emergencyColor = feed.summary.emergency > 0 ? '#FF0000' : '#00FF00';
      ctx.fillStyle = emergencyColor;
      const emergencyText = feed.summary.emergency > 0 ? `EMERGENCY: ${feed.summary.emergency}` : 'EMERGENCY: NO';
      ctx.fillText(emergencyText, 15, 90);
    });
  };

  const totalCars = cameraFeeds.reduce((sum, feed) => sum + feed.summary.cars, 0);
  const totalEmergency = cameraFeeds.reduce((sum, feed) => sum + feed.summary.emergency, 0);
  const totalVehicles = totalCars + totalEmergency;
  const hasEmergency = totalEmergency > 0;

  return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Live Traffic CCTV Monitor</h1>
            <p className="text-gray-400 mt-1">Real-time AI-Powered Vehicle Detection - Auto-Processing All Cameras</p>
          </div>
          <Badge
            variant="secondary"
            className={`px-4 py-2 text-lg ${
              hasEmergency
                ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                : isDetecting
                ? 'bg-green-500/20 text-green-300 border-green-500/50'
                : 'bg-gray-500/20 text-gray-300 border-gray-500/50'
            }`}
          >
            {hasEmergency ? (
              <>
                <AlertTriangle className="mr-2 h-5 w-5" />
                EMERGENCY DETECTED
              </>
            ) : (
              <>
                <Activity className="mr-2 h-5 w-5 animate-pulse" />
                LIVE DETECTION
              </>
            )}
          </Badge>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Cars Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalCars}</div>
              <p className="text-xs text-gray-500 mt-1">Across all lanes</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Emergency Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasEmergency ? 'text-red-400' : 'text-white'}`}>
                {totalEmergency}
              </div>
              <p className="text-xs text-gray-500 mt-1">Active in grid</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalVehicles}</div>
              <p className="text-xs text-gray-500 mt-1">All detections</p>
            </CardContent>
          </Card>

          <Card className={`${
            hasEmergency
              ? 'bg-gradient-to-br from-red-900/30 to-orange-900/30 border-red-500/50'
              : 'bg-gradient-to-br from-green-900/30 to-teal-900/30 border-green-500/30'
          }`}>
            <CardContent className="p-6">
              <div className="text-center">
                <Video className={`h-8 w-8 mx-auto mb-2 ${isDetecting ? 'text-green-400 animate-pulse' : 'text-gray-400'}`} />
                <div className="text-xl font-bold text-white">
                  {cameraFeeds.filter(f => f.status === 'active').length}/4
                </div>
                <div className="text-xs text-gray-300 mt-1">Cameras Active</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Bar */}
        <Card className={`${isDetecting ? 'bg-green-900/30 border-green-500/30' : 'bg-blue-900/30 border-blue-500/30'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isDetecting ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-sm text-gray-300 font-medium">{statusText}</span>
              {frameCountRef.current > 0 && (
                <span className="text-xs text-gray-400 ml-auto">Total Frames Processed: {frameCountRef.current}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4-Lane Camera Grid */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl">Live Camera Feeds with YOLO Detection</CardTitle>
                <p className="text-sm text-gray-400 mt-1">
                  Real-time vehicle detection using best.pt model - Auto-processing every 2 seconds
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              {cameraFeeds.map((camera, index) => (
                <Card key={camera.id} className="bg-gray-900/70 border-gray-600">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-white">
                        {camera.name}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className={
                          camera.status === 'error'
                            ? 'bg-red-500/20 text-red-300 border-red-500/50'
                            : camera.summary.emergency > 0
                            ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                            : camera.summary.total > 0
                            ? 'bg-green-500/20 text-green-300 border-green-500/50'
                            : 'bg-gray-500/20 text-gray-300 border-gray-500/50'
                        }
                      >
                        {camera.status === 'error'
                          ? 'ERROR'
                          : camera.status === 'connecting'
                          ? 'CONNECTING...'
                          : camera.summary.total > 0
                          ? `${camera.summary.total} VEHICLES`
                          : 'ACTIVE'
                        }
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-video bg-black rounded-md relative overflow-hidden border border-gray-700">
                      {/* Video Element */}
                      <video
                        ref={el => videoRefs.current[index] = el}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />

                      {/* Hidden canvas for frame capture */}
                      <canvas
                        ref={el => canvasRefs.current[index] = el}
                        className="hidden"
                      />

                      {/* Overlay Canvas for bounding boxes */}
                      <canvas
                        ref={el => overlayRefs.current[index] = el}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        style={{ zIndex: 10 }}
                      />

                      {/* Loading indicator */}
                      {camera.status === 'connecting' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="text-white text-sm">Connecting to camera...</div>
                        </div>
                      )}

                      {/* Error indicator */}
                      {camera.status === 'error' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                          <div className="text-red-400 text-sm text-center px-4">
                            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                            Camera connection failed
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Detection Stats */}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-gray-800/50 px-2 py-1 rounded text-center">
                        <span className="text-gray-400 block">Cars</span>
                        <span className="text-white font-semibold">{camera.summary.cars}</span>
                      </div>
                      <div className="bg-gray-800/50 px-2 py-1 rounded text-center">
                        <span className="text-gray-400 block">Emergency</span>
                        <span className={`font-semibold ${camera.summary.emergency > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {camera.summary.emergency}
                        </span>
                      </div>
                      <div className="bg-gray-800/50 px-2 py-1 rounded text-center">
                        <span className="text-gray-400 block">Total</span>
                        <span className="text-white font-semibold">{camera.summary.total}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/30">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Information
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-300">
              <div>
                <p className="font-semibold text-white mb-2">Detection Details:</p>
                <ul className="space-y-1">
                  <li>• Model: best.pt (YOLO)</li>
                  <li>• Detection Interval: 2 seconds</li>
                  <li>• Image Quality: 85%</li>
                  <li>• Confidence Threshold: 30%</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-white mb-2">Camera Configuration:</p>
                <ul className="space-y-1">
                  <li>• Total Cameras: 4 lanes</li>
                  <li>• Auto-start: Enabled</li>
                  <li>• Green boxes: Regular vehicles</li>
                  <li>• Red boxes: Emergency vehicles</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-md">
              <p className="text-xs text-yellow-200">
                <strong>Note:</strong> Currently using webcam for demo. To use real camera streams, edit <code>src/config/cameraStreams.ts</code> and update the CAMERA_STREAMS array with your RTSP/HTTP/HLS camera URLs.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default LiveTraffic;
