/**
 * Camera Stream Configuration for SmartFlow AI
 *
 * Configure your camera stream URLs here for the Live Traffic page.
 */

export interface CameraStreamConfig {
  id: number;
  name: string;
  streamUrl: string;
  streamType: 'webcam' | 'rtsp' | 'http' | 'hls';
}

// ============================================================================
// CAMERA CONFIGURATION
// ============================================================================
// Update these settings with your actual camera stream URLs
// ============================================================================

export const CAMERA_STREAMS: CameraStreamConfig[] = [
  {
    id: 1,
    name: 'Road 1',
    // For webcam: 'webcam:0' (0 = first webcam, 1 = second webcam, etc.)
    // For RTSP: 'rtsp://username:password@ip:port/stream'
    // For HTTP/MJPEG: 'http://ip:port/video/stream.mjpeg'
    // For HLS: 'https://example.com/stream.m3u8'
    streamUrl: 'webcam:0',
    streamType: 'webcam',
  },
  {
    id: 2,
    name: 'Road 2',
    streamUrl: 'webcam:0', // Using same webcam for demo - change to your camera 2 URL
    streamType: 'webcam',
  },
  {
    id: 3,
    name: 'Road 3',
    streamUrl: 'webcam:0', // Change to your camera 3 URL
    streamType: 'webcam',
  },
  {
    id: 4,
    name: 'Road 4',
    streamUrl: 'webcam:0', // Change to your camera 4 URL
    streamType: 'webcam',
  },
];

// ============================================================================
// DETECTION SETTINGS
// ============================================================================

export const DETECTION_CONFIG = {
  // How often to capture and process frames (milliseconds)
  detectionInterval: 2000, // 2 seconds

  // Image quality for frame capture (0.0 - 1.0)
  // OPTIMIZED: Reduced from 85% to 60% for faster processing
  // YOLO doesn't need high quality; this reduces bandwidth by ~30%
  imageQuality: 0.60, // 60% - optimized for speed while maintaining accuracy

  // Confidence threshold for YOLO detections (0.0 - 1.0)
  confidenceThreshold: 0.3, // 30%

  // Automatically start detection when page loads
  autoStart: true,

  // Backend API URL
  backendUrl: 'http://localhost:3000',
};

// ============================================================================
// EXAMPLE CONFIGURATIONS
// ============================================================================

/*
// Example 1: Using different webcams
export const CAMERA_STREAMS: CameraStreamConfig[] = [
  { id: 1, name: 'Road 1', streamUrl: 'webcam:0', streamType: 'webcam' },
  { id: 2, name: 'Road 2', streamUrl: 'webcam:1', streamType: 'webcam' },
  { id: 3, name: 'Road 3', streamUrl: 'webcam:2', streamType: 'webcam' },
  { id: 4, name: 'Road 4', streamUrl: 'webcam:3', streamType: 'webcam' },
];

// Example 2: Using RTSP camera streams
export const CAMERA_STREAMS: CameraStreamConfig[] = [
  { id: 1, name: 'Road 1', streamUrl: 'rtsp://admin:pass@192.168.1.100:554/stream1', streamType: 'rtsp' },
  { id: 2, name: 'Road 2', streamUrl: 'rtsp://admin:pass@192.168.1.101:554/stream1', streamType: 'rtsp' },
  { id: 3, name: 'Road 3', streamUrl: 'rtsp://admin:pass@192.168.1.102:554/stream1', streamType: 'rtsp' },
  { id: 4, name: 'Road 4', streamUrl: 'rtsp://admin:pass@192.168.1.103:554/stream1', streamType: 'rtsp' },
];

// Example 3: Using HTTP/MJPEG streams
export const CAMERA_STREAMS: CameraStreamConfig[] = [
  { id: 1, name: 'Road 1', streamUrl: 'http://192.168.1.100:8080/video', streamType: 'http' },
  { id: 2, name: 'Road 2', streamUrl: 'http://192.168.1.101:8080/video', streamType: 'http' },
  { id: 3, name: 'Road 3', streamUrl: 'http://192.168.1.102:8080/video', streamType: 'http' },
  { id: 4, name: 'Road 4', streamUrl: 'http://192.168.1.103:8080/video', streamType: 'http' },
];

// Example 4: Using HLS streams
export const CAMERA_STREAMS: CameraStreamConfig[] = [
  { id: 1, name: 'Road 1', streamUrl: 'https://example.com/road1/stream.m3u8', streamType: 'hls' },
  { id: 2, name: 'Road 2', streamUrl: 'https://example.com/road2/stream.m3u8', streamType: 'hls' },
  { id: 3, name: 'Road 3', streamUrl: 'https://example.com/road3/stream.m3u8', streamType: 'hls' },
  { id: 4, name: 'Road 4', streamUrl: 'https://example.com/road4/stream.m3u8', streamType: 'hls' },
];

// Example 5: Mixed setup
export const CAMERA_STREAMS: CameraStreamConfig[] = [
  { id: 1, name: 'Road 1', streamUrl: 'webcam:0', streamType: 'webcam' },
  { id: 2, name: 'Road 2', streamUrl: 'rtsp://admin:pass@192.168.1.101:554/stream1', streamType: 'rtsp' },
  { id: 3, name: 'Road 3', streamUrl: 'http://192.168.1.102:8080/video', streamType: 'http' },
  { id: 4, name: 'Road 4', streamUrl: 'https://example.com/road4/stream.m3u8', streamType: 'hls' },
];
*/

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const getStreamUrl = (config: CameraStreamConfig): string => {
  // For webcam, return the webcam identifier
  // For other types, return the URL directly
  return config.streamUrl;
};

export const isWebcamStream = (streamUrl: string): boolean => {
  return streamUrl.startsWith('webcam:');
};

export const getWebcamIndex = (streamUrl: string): number => {
  if (!isWebcamStream(streamUrl)) return 0;
  const parts = streamUrl.split(':');
  return parseInt(parts[1] || '0', 10);
};
