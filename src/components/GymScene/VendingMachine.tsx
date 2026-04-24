import { useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text, useCursor } from '@react-three/drei'
import * as THREE from 'three'

const MACHINE_W = 2.2
const MACHINE_H = 4.2
const MACHINE_D = 1.1

/**
 * Neon vending machine — the hero object. Emissive façade with pulsing "CLICK ME"
 * signs above and floating in front. Clicking invokes `onClick`, which mounts the
 * login modal at the app level.
 */
export function VendingMachine({
  position = [0, 0, 0] as [number, number, number],
  onClick,
}: {
  position?: [number, number, number]
  onClick: () => void
}) {
  const facade = useRef<THREE.MeshStandardMaterial>(null)
  const neonA = useRef<THREE.MeshBasicMaterial>(null)
  const neonB = useRef<THREE.MeshBasicMaterial>(null)
  const arrowRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Breathing neon
    const pulse = 0.72 + Math.sin(t * 2.2) * 0.28
    if (facade.current) facade.current.emissiveIntensity = 1.3 + pulse * 0.9
    if (neonA.current) neonA.current.opacity = 0.75 + pulse * 0.25
    if (neonB.current) neonB.current.opacity = 0.6 + Math.sin(t * 3.5) * 0.4

    // Bobbing arrow
    if (arrowRef.current) {
      arrowRef.current.position.y = Math.sin(t * 3) * 0.08
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick()
  }

  return (
    <group position={position}>
      {/* Main body — hot-magenta emissive façade */}
      <mesh
        position={[0, MACHINE_H / 2, 0]}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        castShadow
      >
        <boxGeometry args={[MACHINE_W, MACHINE_H, MACHINE_D]} />
        <meshStandardMaterial
          ref={facade}
          color="#14050e"
          emissive="#ec4899"
          emissiveIntensity={1.6}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      {/* Screen cavity — darker recess behind glass */}
      <mesh position={[0, MACHINE_H * 0.62, MACHINE_D / 2 + 0.002]}>
        <planeGeometry args={[MACHINE_W * 0.78, MACHINE_H * 0.44]} />
        <meshStandardMaterial
          color="#0a0208"
          emissive="#a21caf"
          emissiveIntensity={0.8}
          roughness={0.3}
        />
      </mesh>

      {/* Inner racks (fake snacks — colored cans) */}
      {Array.from({ length: 4 }).map((_, row) => (
        <group key={row} position={[0, MACHINE_H * 0.42 + row * 0.28, MACHINE_D / 2 + 0.01]}>
          {Array.from({ length: 4 }).map((__, col) => (
            <mesh key={col} position={[-0.65 + col * 0.43, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.22, 14]} />
              <meshStandardMaterial
                color={row % 2 === col % 2 ? '#f59e0b' : '#06b6d4'}
                emissive={row % 2 === col % 2 ? '#f59e0b' : '#06b6d4'}
                emissiveIntensity={0.4}
                roughness={0.45}
                metalness={0.7}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Delivery slot */}
      <mesh position={[0, 0.6, MACHINE_D / 2 + 0.004]}>
        <planeGeometry args={[MACHINE_W * 0.65, 0.35]} />
        <meshStandardMaterial color="#050104" roughness={0.9} />
      </mesh>

      {/* Coin slot strip */}
      <mesh position={[MACHINE_W * 0.32, 1.4, MACHINE_D / 2 + 0.004]}>
        <planeGeometry args={[0.28, 0.9]} />
        <meshStandardMaterial color="#1a0a13" emissive="#ec4899" emissiveIntensity={0.5} />
      </mesh>

      {/* Top crown sign — "CLICK ME" in electric yellow */}
      <group position={[0, MACHINE_H + 0.55, 0]}>
        <mesh>
          <boxGeometry args={[MACHINE_W * 1.2, 0.7, 0.2]} />
          <meshStandardMaterial
            color="#1a1500"
            emissive="#facc15"
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
        <Text
          position={[0, 0, 0.12]}
          fontSize={0.32}
          color="#1a1500"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          fontWeight={700}
        >
          CLICK ME
        </Text>
      </group>

      {/* Side strip — vertical "PRIME / FUEL / READY" */}
      <mesh position={[MACHINE_W / 2 + 0.01, MACHINE_H / 2, 0]}>
        <planeGeometry args={[0.28, MACHINE_H * 0.9]} />
        <meshBasicMaterial
          ref={neonA}
          color="#22d3ee"
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </mesh>
      <Text
        position={[MACHINE_W / 2 + 0.17, MACHINE_H / 2 + 0.6, 0]}
        rotation={[0, Math.PI / 2, Math.PI / 2]}
        fontSize={0.24}
        color="#012b2e"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.28}
        fontWeight={700}
      >
        PRIME · FUEL · READY
      </Text>

      {/* Floating bobbing arrow — "this one, champ" */}
      <group ref={arrowRef} position={[0, MACHINE_H + 1.6, 0]}>
        <Text
          fontSize={0.38}
          color="#facc15"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          outlineWidth={0.02}
          outlineColor="#1a1500"
        >
          ↓  CLICK ME  ↓
        </Text>
      </group>

      {/* Ground glow puddle */}
      <mesh position={[0, 0.01, MACHINE_D * 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial
          ref={neonB}
          color="#ec4899"
          transparent
          opacity={0.38}
          toneMapped={false}
        />
      </mesh>

      {/* Fill light so the machine illuminates nearby geometry */}
      <pointLight
        position={[0, MACHINE_H * 0.6, MACHINE_D]}
        color="#ec4899"
        intensity={3}
        distance={10}
        decay={1.6}
      />
      <pointLight
        position={[0, MACHINE_H + 0.5, 0.4]}
        color="#facc15"
        intensity={1.2}
        distance={6}
        decay={1.8}
      />
    </group>
  )
}
