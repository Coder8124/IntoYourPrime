import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Environment } from './Environment'
import { VendingMachine } from './VendingMachine'
import { BenchPress, Dumbbell, WeightStack } from './Equipment'

/**
 * Parallax-y camera drift tied to mouse position — sells "you're standing in this room."
 * Kept small: max ~0.4 units of drift so the scene composition never breaks.
 */
function CameraRig() {
  const rig = useRef<THREE.Group>(null)
  useFrame(({ mouse, camera }) => {
    if (!rig.current) return
    const tx = mouse.x * 0.5
    const ty = 2.6 + mouse.y * 0.18
    rig.current.position.x += (tx - rig.current.position.x) * 0.05
    rig.current.position.y += (ty - rig.current.position.y) * 0.05
    camera.lookAt(0, 2.3, 0)
  })
  return <group ref={rig} position={[0, 2.6, 11]}>
    <PerspectiveCamera makeDefault fov={55} near={0.1} far={60} />
  </group>
}

export function GymScene({ onVendClick }: { onVendClick: () => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#05040a']} />
      <fog attach="fog" args={['#07050b', 10, 30]} />

      <Suspense fallback={null}>
        <CameraRig />
        <Environment />

        {/* Hero — vending machine, dead center and slightly forward */}
        <VendingMachine position={[0, 0, -1]} onClick={onVendClick} />

        {/* Bench press on the right */}
        <BenchPress position={[4.5, 0, 0.5]} />

        {/* Weight stack on the left */}
        <WeightStack position={[-4.8, 0, 0.2]} />

        {/* Dumbbells scattered */}
        <Dumbbell position={[-3.2, 0.13, 2.2]} rotation={[0, 0.4, 0]} color="#dc2626" />
        <Dumbbell position={[-2.6, 0.13, 2.0]} rotation={[0, 0.6, 0]} color="#dc2626" />
        <Dumbbell position={[3.1, 0.13, 2.4]} rotation={[0, -0.3, 0]} color="#0ea5e9" />
        <Dumbbell position={[2.5, 0.13, 2.1]} rotation={[0, -0.1, 0]} color="#0ea5e9" />

        {/* Stray plate on the ground as detritus */}
        <mesh position={[-1.2, 0.05, 3.2]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.08, 28]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.12} roughness={0.55} />
        </mesh>

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.85}
            luminanceThreshold={0.35}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          <ChromaticAberration
            offset={new THREE.Vector2(0.0004, 0.0006)}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.15} darkness={0.95} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  )
}
