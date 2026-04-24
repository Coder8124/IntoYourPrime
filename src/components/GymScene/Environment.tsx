import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const FLOOR_SIZE = 40
const WALL_HEIGHT = 8
const ROOM = 14

/**
 * Basement gym shell — concrete floor, breeze-block walls, steel I-beam ceiling
 * with 3 fluorescent tubes that flicker just enough to feel alive.
 */
export function Environment() {
  const tube1 = useRef<THREE.PointLight>(null)
  const tube2 = useRef<THREE.PointLight>(null)
  const tube3 = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Cheap cinematic flicker — each tube has its own phase
    if (tube1.current) tube1.current.intensity = 2.2 + Math.sin(t * 9.0) * 0.15 + (Math.random() < 0.005 ? -1.5 : 0)
    if (tube2.current) tube2.current.intensity = 1.9 + Math.sin(t * 7.4 + 1.5) * 0.1 + (Math.random() < 0.004 ? -1.2 : 0)
    if (tube3.current) tube3.current.intensity = 2.0 + Math.sin(t * 6.2 + 3.0) * 0.12
  })

  return (
    <group>
      {/* Concrete floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#1a1815" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Painted floor lane stripe */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[2.2, FLOOR_SIZE * 0.7]} />
        <meshStandardMaterial color="#3a2818" roughness={0.85} />
      </mesh>

      {/* Back wall (behind camera) */}
      <mesh position={[0, WALL_HEIGHT / 2, -ROOM]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE, WALL_HEIGHT, 0.3]} />
        <meshStandardMaterial color="#14110d" roughness={0.9} />
      </mesh>

      {/* Side walls */}
      <mesh position={[-ROOM, WALL_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE, WALL_HEIGHT, 0.3]} />
        <meshStandardMaterial color="#14110d" roughness={0.9} />
      </mesh>
      <mesh position={[ROOM, WALL_HEIGHT / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_SIZE, WALL_HEIGHT, 0.3]} />
        <meshStandardMaterial color="#14110d" roughness={0.9} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#0a0805" roughness={1} />
      </mesh>

      {/* I-beam trusses */}
      {[-6, 0, 6].map((z, i) => (
        <group key={i} position={[0, WALL_HEIGHT - 0.15, z]}>
          <mesh>
            <boxGeometry args={[FLOOR_SIZE * 0.7, 0.25, 0.4]} />
            <meshStandardMaterial color="#2a2520" roughness={0.8} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Fluorescent tubes (visual + light) */}
      {[
        { pos: [-5, WALL_HEIGHT - 0.35, -4] as const, ref: tube1 },
        { pos: [5, WALL_HEIGHT - 0.35, 0] as const, ref: tube2 },
        { pos: [-3, WALL_HEIGHT - 0.35, 4] as const, ref: tube3 },
      ].map((t, i) => (
        <group key={i} position={t.pos}>
          <mesh>
            <boxGeometry args={[3.6, 0.12, 0.22]} />
            <meshStandardMaterial
              color="#fff7d6"
              emissive="#fff4b0"
              emissiveIntensity={2.2}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            ref={t.ref}
            color="#fff1c0"
            intensity={2}
            distance={16}
            decay={1.8}
          />
        </group>
      ))}

      {/* Warm rim light on back wall (adds atmospheric depth) */}
      <spotLight
        position={[0, 5, 2]}
        angle={1.0}
        penumbra={0.8}
        intensity={1.2}
        color="#f59e0b"
        distance={18}
      />

      {/* Ambient base so shadows aren't pitch black */}
      <ambientLight intensity={0.22} color="#5a4830" />
      <hemisphereLight args={['#2a2015', '#07050a', 0.35]} />
    </group>
  )
}
