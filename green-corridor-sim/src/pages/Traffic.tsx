import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei';
import { RealisticCar } from '@/components/vehicles/RealisticCar';
import { RealisticBike } from '@/components/vehicles/RealisticBike';
import { RealisticAmbulance } from '@/components/vehicles/RealisticAmbulance';
import { RealisticAuto } from '@/components/vehicles/RealisticAuto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Car, Bike, Truck, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const Traffic = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string>('all');

  const vehicleGroups = [
    {
      type: 'cars',
      name: 'Cars',
      icon: Car,
      count: 12,
      vehicles: [
        { position: [-12, 0, -8], rotation: [0, 0, 0], color: 0x3366AA},
        { position: [-6, 0, -8], rotation: [0, 0, 0], color: 0xAA3333 },
        { position: [0, 0, -8], rotation: [0, 0, 0], color: 0x33AA55 },
        { position: [6, 0, -8], rotation: [0, 0, 0], color: 0x8855CC},
        { position: [12, 0, -8], rotation: [0, 0, 0], color: 0xCC8833 },
        { position: [-12, 0, -4], rotation: [0, Math.PI / 4, 0], color: 0x666666 },
        { position: [-6, 0, -4], rotation: [0, -Math.PI / 6, 0], color: 0xBB4444 },
        { position: [0, 0, -4], rotation: [0, Math.PI / 3, 0], color: 0x2C5F2D },
        { position: [6, 0, -4], rotation: [0, -Math.PI / 4, 0], color: 0x1E40AF },
        { position: [12, 0, -4], rotation: [0, Math.PI / 6, 0], color: 0x7C2D12 },
        { position: [-3, 0, 0], rotation: [0, Math.PI / 2, 0], color: 0xFFD700 },
        { position: [3, 0, 0], rotation: [0, -Math.PI / 2, 0], color: 0x3399AA },
      ]
    },
    {
      type: 'bikes',
      name: 'Motorcycles',
      icon: Bike,
      count: 8,
      vehicles: [
        { position: [-10, 0, 4], rotation: [0, 0, 0], color: 0xFF3333 },
        { position: [-5, 0, 4], rotation: [0, 0, 0], color: 0x000000 },
        { position: [0, 0, 4], rotation: [0, 0, 0], color: 0x0066FF },
        { position: [5, 0, 4], rotation: [0, 0, 0], color: 0xFFFFFF },
        { position: [10, 0, 4], rotation: [0, 0, 0], color: 0xFF9900 },
        { position: [-7.5, 0, 6], rotation: [0, Math.PI / 4, 0], color: 0x00AA00 },
        { position: [-2.5, 0, 6], rotation: [0, -Math.PI / 4, 0], color: 0xFF3333 },
        { position: [2.5, 0, 6], rotation: [0, Math.PI / 3, 0], color: 0x000000 },
      ]
    },
    {
      type: 'autos',
      name: 'Auto Rickshaws',
      icon: Navigation,
      count: 6,
      vehicles: [
        { position: [-9, 0, 10], rotation: [0, 0, 0], color: 0xFFDD00 },
        { position: [-3, 0, 10], rotation: [0, 0, 0], color: 0x00AA00 },
        { position: [3, 0, 10], rotation: [0, 0, 0], color: 0xFFDD00 },
        { position: [9, 0, 10], rotation: [0, 0, 0], color: 0xFFAA00 },
        { position: [-6, 0, 12], rotation: [0, Math.PI / 6, 0], color: 0xFFDD00 },
        { position: [6, 0, 12], rotation: [0, -Math.PI / 6, 0], color: 0x33AA33 },
      ]
    },
    {
      type: 'ambulance',
      name: 'Ambulance',
      icon: Truck,
      count: 1,
      vehicles: [
        { position: [0, 0, -12], rotation: [0, 0, 0], color: 0xFFFFFF },
      ]
    }
  ];

  const shouldShowVehicle = (type: string) => {
    return selectedType === 'all' || selectedType === type;
  };

  const totalVehicles = vehicleGroups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="text-gray-300 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-white">Traffic Showcase</h1>
                <p className="text-sm text-gray-400">Realistic 3D Vehicle Collection</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
              {totalVehicles} Vehicles
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Vehicle Filter</CardTitle>
                <CardDescription className="text-gray-400">
                  Select vehicle type
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => setSelectedType('all')}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedType === 'all'
                      ? 'bg-blue-500/20 border-blue-500/50 text-white'
                      : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">All Vehicles</span>
                    <Badge variant="secondary">{totalVehicles}</Badge>
                  </div>
                </button>

                {vehicleGroups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <button
                      key={group.type}
                      onClick={() => setSelectedType(group.type)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedType === group.type
                          ? 'bg-blue-500/20 border-blue-500/50 text-white'
                          : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{group.name}</span>
                        </div>
                        <Badge variant="secondary">{group.count}</Badge>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-900/30 to-blue-900/30 border-green-500/30">
              <CardContent className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white mb-1">{totalVehicles}</div>
                  <div className="text-sm text-gray-300">Total Vehicles</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 3D Viewport */}
          <div className="lg:col-span-3">
            <Card className="bg-gray-800/50 border-gray-700 overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">3D Traffic Scene</CardTitle>
                    <CardDescription className="text-gray-400">
                      Drag to rotate • Scroll to zoom • Right-click to pan
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/ml-dataset')}
                    className="border-gray-600 text-gray-300 hover:text-white"
                  >
                    ML Dataset
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="w-full h-[700px] bg-gradient-to-b from-sky-900/20 to-gray-900">
                  <Canvas shadows>
                    <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={60} />
                    <OrbitControls
                      enableDamping
                      dampingFactor={0.05}
                      minDistance={10}
                      maxDistance={50}
                      maxPolarAngle={Math.PI / 2}
                    />

                    {/* Lighting */}
                    <ambientLight intensity={0.5} />
                    <directionalLight
                      position={[15, 25, 15]}
                      intensity={1.5}
                      castShadow
                      shadow-mapSize-width={2048}
                      shadow-mapSize-height={2048}
                      shadow-camera-far={60}
                      shadow-camera-left={-30}
                      shadow-camera-right={30}
                      shadow-camera-top={30}
                      shadow-camera-bottom={-30}
                    />
                    <directionalLight position={[-15, 15, -15]} intensity={0.5} />
                    <hemisphereLight intensity={0.3} groundColor="#444444" />

                    {/* Environment */}
                    <Environment preset="sunset" />

                    {/* Grid Floor */}
                    <Grid
                      args={[80, 80]}
                      cellSize={1}
                      cellThickness={0.5}
                      cellColor="#444444"
                      sectionSize={5}
                      sectionThickness={1}
                      sectionColor="#666666"
                      fadeDistance={50}
                      fadeStrength={1}
                      position={[0, -0.01, 0]}
                    />

                    {/* Floor plane for shadows */}
                    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                      <planeGeometry args={[150, 150]} />
                      <shadowMaterial opacity={0.3} />
                    </mesh>

                    {/* Render Cars */}
                    {shouldShowVehicle('cars') && vehicleGroups[0].vehicles.map((vehicle, idx) => (
                      <RealisticCar
                        key={`car-${idx}`}
                        position={vehicle.position as [number, number, number]}
                        rotation={vehicle.rotation as [number, number, number]}
                        color={vehicle.color}
                        scale={1.2}
                        animated={false}
                      />
                    ))}

                    {/* Render Bikes */}
                    {shouldShowVehicle('bikes') && vehicleGroups[1].vehicles.map((vehicle, idx) => (
                      <RealisticBike
                        key={`bike-${idx}`}
                        position={vehicle.position as [number, number, number]}
                        rotation={vehicle.rotation as [number, number, number]}
                        color={vehicle.color}
                        scale={1.2}
                        animated={false}
                      />
                    ))}

                    {/* Render Autos */}
                    {shouldShowVehicle('autos') && vehicleGroups[2].vehicles.map((vehicle, idx) => (
                      <RealisticAuto
                        key={`auto-${idx}`}
                        position={vehicle.position as [number, number, number]}
                        rotation={vehicle.rotation as [number, number, number]}
                        color={vehicle.color}
                        scale={1.2}
                        animated={false}
                      />
                    ))}

                    {/* Render Ambulance */}
                    {shouldShowVehicle('ambulance') && vehicleGroups[3].vehicles.map((vehicle, idx) => (
                      <RealisticAmbulance
                        key={`ambulance-${idx}`}
                        position={vehicle.position as [number, number, number]}
                        rotation={vehicle.rotation as [number, number, number]}
                        scale={1.2}
                        animated={true}
                      />
                    ))}
                  </Canvas>
                </div>
              </CardContent>
            </Card>

            {/* Info Cards */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    Realistic Details
                  </h3>
                  <p className="text-sm text-gray-300">
                    All vehicles feature detailed 3D geometry, realistic materials, proper shadows,
                    and authentic color schemes representing real Indian traffic.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Multiple Types
                  </h3>
                  <p className="text-sm text-gray-300">
                    Includes sedans, motorcycles, auto-rickshaws, and emergency vehicles.
                    Each type has unique characteristics and behavior patterns.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Traffic;
