import { Suspense, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Environment } from './Environment'
import { VendingMachine, type Drink } from './VendingMachine'
import { BenchPress, CourtDoor, Dumbbell, WeightStack } from './Equipment'

export type { Drink } from './VendingMachine'

type CameraTarget = 'idle' | 'vending' | 'bench' | 'door'

const DEFAULT_CAM: [number, number, number] = [0, 2.6, 11]
const DEFAULT_LOOK: [number, number, number] = [0, 2.3, 0]
// Zoom target when a can is dispensed — pull right in on the tray
const VENDING_ZOOM_CAM: [number, number, number] = [0, 1.0, 4.0]
const VENDING_ZOOM_LOOK: [number, number, number] = [0, 0.25, 0]
// Camera position looking at the bench
const BENCH_CAM: [number, number, number] = [3.0, 1.8, 5.5]
const BENCH_LOOK: [number, number, number] = [4.5, 1.2, 0.5]
// Camera approaching the basketball door — fly-in effect
const DOOR_CAM: [number, number, number] = [-7.5, 2.4, -8.0]
const DOOR_LOOK: [number, number, number] = [-8.5, 2.0, -13]

function CameraRig({ target }: { target: CameraTarget }) {
  const rig = useRef<THREE.Group>(null)
  const lookAtRef = useRef(new THREE.Vector3(...DEFAULT_LOOK))
  const targetLook = useRef(new THREE.Vector3(...DEFAULT_LOOK))

  useFrame(({ mouse, camera }, delta) => {
    if (!rig.current) return

    const [cx, cy, cz] =
      target === 'vending' ? VENDING_ZOOM_CAM :
      target === 'bench'   ? BENCH_CAM :
      target === 'door'    ? DOOR_CAM :
      DEFAULT_CAM
    const [lx, ly, lz] =
      target === 'vending' ? VENDING_ZOOM_LOOK :
      target === 'bench'   ? BENCH_LOOK :
      target === 'door'    ? DOOR_LOOK :
      DEFAULT_LOOK

    // Idle parallax follows mouse; during zoom, ignore mouse
    const tx = target === 'idle' ? cx + mouse.x * 0.5 : cx
    const ty = target === 'idle' ? cy + mouse.y * 0.18 : cy

    const lerp = Math.min(1, delta * (target === 'idle' ? 5 : 2.2))
    rig.current.position.x += (tx - rig.current.position.x) * lerp
    rig.current.position.y += (ty - rig.current.position.y) * lerp
    rig.current.position.z += (cz - rig.current.position.z) * lerp

    targetLook.current.set(lx, ly, lz)
    lookAtRef.current.lerp(targetLook.current, lerp)
    camera.lookAt(lookAtRef.current)
  })

  return (
    <group ref={rig} position={DEFAULT_CAM}>
      <PerspectiveCamera makeDefault fov={55} near={0.1} far={60} />
    </group>
  )
}

export function GymScene({
  onVendingDispensed,
  onBenchClicked,
  onDoorClicked,
  cameraTarget = 'idle',
}: {
  onVendingDispensed: (drink: Drink) => void
  onBenchClicked: () => void
  onDoorClicked: () => void
  cameraTarget?: CameraTarget
}) {
  const [benchRepProgress, setBenchRepProgress] = useState(0)

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#bfe3ff']} />
      <fog attach="fog" args={['#e4f0ff', 22, 60]} />

      <Suspense fallback={null}>
        <CameraRig target={cameraTarget} />
        <Environment />

        <VendingMachine
          position={[0, 0, -1]}
          onDispensed={(drink) => { onVendingDispensed(drink) }}
        />

        <BenchPress
          position={[4.5, 0, 0.5]}
          onClick={onBenchClicked}
          liftProgress={benchRepProgress}
        />

        {/* Bench minigame progress exposed to window so the HUD can animate the 3D bar */}
        <BenchRepBridge onProgress={setBenchRepProgress} />

        <WeightStack position={[-4.8, 0, 0.2]} />

        {/* Basketball-room door — back-left wall, slightly inset so the frame reads */}
        <CourtDoor
          position={[-8.5, 0, -13.6]}
          rotation={[0, 0, 0]}
          onClick={onDoorClicked}
        />

        <Dumbbell position={[-3.2, 0.13, 2.2]} rotation={[0, 0.4, 0]} color="#dc2626" />
        <Dumbbell position={[-2.6, 0.13, 2.0]} rotation={[0, 0.6, 0]} color="#dc2626" />
        <Dumbbell position={[3.1, 0.13, 2.4]} rotation={[0, -0.3, 0]} color="#0ea5e9" />
        <Dumbbell position={[2.5, 0.13, 2.1]} rotation={[0, -0.1, 0]} color="#0ea5e9" />

        {/* Stray plate — tucked into the right back corner so it doesn't block the camera */}
        <mesh position={[6.2, 0.05, -3.5]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.08, 28]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.12} roughness={0.55} />
        </mesh>

        <EffectComposer multisampling={0}>
          <Bloom intensity={0.55} luminanceThreshold={0.6} luminanceSmoothing={0.4} mipmapBlur />
          <ChromaticAberration
            offset={new THREE.Vector2(0.0002, 0.0003)}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.35} darkness={0.55} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.12} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  )
}

/** Subscribes to the global bench-minigame event bus so the 3D scene can react. */
function BenchRepBridge({ onProgress }: { onProgress: (v: number) => void }) {
  useFrame(() => {
    const anyWin = window as unknown as { __benchLift?: number }
    const v = anyWin.__benchLift ?? 0
    onProgress(v)
  })
  return null
}
