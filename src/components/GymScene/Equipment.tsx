import { useRef, useState, type JSX } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text, useCursor } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Static gym equipment — bench press with loaded bar, dumbbell pair, stacked weight plates.
 * All built from primitive geometries; no external meshes.
 *
 * BenchPress accepts:
 *   - onClick: fires when the user taps it to start the minigame
 *   - liftProgress: 0..1 drives the barbell's Y lift for the minigame animation
 */

export function BenchPress({
  position,
  onClick,
  liftProgress = 0,
}: {
  position: [number, number, number]
  onClick?: () => void
  liftProgress?: number
}): JSX.Element {
  const barRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !!onClick)

  useFrame(() => {
    if (!barRef.current) return
    // Rest height 1.7 (J-hook rest) → lift target 2.5 at full progress
    const target = 1.7 + liftProgress * 0.8
    barRef.current.position.y += (target - barRef.current.position.y) * 0.25
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return
    e.stopPropagation()
    onClick()
  }

  return (
    <group position={position}>
      {/* Bench pad */}
      <mesh
        position={[0, 0.55, 0]}
        castShadow
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.55, 0.16, 1.9]} />
        <meshStandardMaterial
          color="#0a0a0a"
          emissive={hovered ? '#22d3ee' : '#000'}
          emissiveIntensity={hovered ? 0.25 : 0}
          roughness={0.75}
          metalness={0.15}
        />
      </mesh>
      {/* Pad inner stitching band */}
      <mesh position={[0, 0.63, 0]}>
        <boxGeometry args={[0.52, 0.005, 1.85]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* Bench base (triangle frame) */}
      <mesh position={[0, 0.28, 0.8]} castShadow>
        <boxGeometry args={[0.1, 0.55, 0.1]} />
        <meshStandardMaterial color="#2a2825" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.28, -0.8]} castShadow>
        <boxGeometry args={[0.1, 0.55, 0.1]} />
        <meshStandardMaterial color="#2a2825" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Feet */}
      <mesh position={[0, 0.03, 0.8]}>
        <boxGeometry args={[0.75, 0.06, 0.12]} />
        <meshStandardMaterial color="#1a1815" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.03, -0.8]}>
        <boxGeometry args={[0.75, 0.06, 0.12]} />
        <meshStandardMaterial color="#1a1815" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Uprights */}
      {[-0.9, 0.9].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.9, 0.3]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.8, 10]} />
            <meshStandardMaterial color="#2a2825" roughness={0.55} metalness={0.55} />
          </mesh>
          {/* J-hook at the top */}
          <mesh position={[x, 1.65, 0.28]}>
            <torusGeometry args={[0.09, 0.03, 8, 14, Math.PI]} />
            <meshStandardMaterial color="#1a1815" roughness={0.5} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Barbell — lifts when liftProgress rises */}
      <group ref={barRef} position={[0, 1.7, 0.3]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 2.4, 12]} />
          <meshStandardMaterial color="#3a3835" roughness={0.35} metalness={0.8} />
        </mesh>
        {/* Knurling rings */}
        {[-0.6, 0.6].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.037, 0.037, 0.15, 12]} />
            <meshStandardMaterial color="#222020" roughness={0.7} metalness={0.6} />
          </mesh>
        ))}
        {/* Plates (two on each side) */}
        {[-1.18, -1.05, 1.05, 1.18].map((x, i) => {
          const big = Math.abs(x) > 1.1
          const color = big ? '#dc2626' : '#1a1a1a'
          const r = big ? 0.42 : 0.3
          return (
            <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[r, r, 0.09, 28]} />
              <meshStandardMaterial
                color={color}
                emissive={big ? '#7f1d1d' : '#0a0a0a'}
                emissiveIntensity={0.08}
                roughness={0.5}
                metalness={0.25}
              />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function Dumbbell({
  position,
  rotation = [0, 0, 0],
  color = '#1a1a1a',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
}): JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.55, 10]} />
        <meshStandardMaterial color="#3a3835" roughness={0.35} metalness={0.75} />
      </mesh>
      {/* Hex weights on each end */}
      {[-0.23, 0.23].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.16, 6]} />
          <meshStandardMaterial color={color} roughness={0.55} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Wooden door with a "BASKETBALL" sign + hoop icon — the entry to the second
 * room/minigame. Pulses gently and lights up on hover. Click → onClick().
 */
export function CourtDoor({
  position,
  rotation = [0, 0, 0],
  onClick,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  onClick?: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !!onClick)
  const signRef = useRef<THREE.MeshStandardMaterial>(null)
  const arrowRef = useRef<THREE.Group>(null)
  const W = 1.6
  const H = 3.2

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (signRef.current) {
      signRef.current.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.4
    }
    if (arrowRef.current) {
      arrowRef.current.position.y = H + 1.0 + Math.sin(t * 3) * 0.06
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return
    e.stopPropagation()
    onClick()
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Door frame (slightly outset) */}
      <mesh position={[0, H / 2, -0.02]}>
        <boxGeometry args={[W + 0.2, H + 0.2, 0.05]} />
        <meshStandardMaterial color="#1a120a" roughness={0.85} metalness={0.1} />
      </mesh>

      {/* Door slab — warm wood, with click handler */}
      <mesh
        position={[0, H / 2, 0]}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        castShadow
      >
        <boxGeometry args={[W, H, 0.12]} />
        <meshStandardMaterial
          color="#7a4d2a"
          emissive={hovered ? '#f59e0b' : '#000'}
          emissiveIntensity={hovered ? 0.45 : 0}
          roughness={0.65}
          metalness={0.05}
        />
      </mesh>

      {/* Vertical inset trim panels */}
      {[-0.35, 0.35].map((x, i) => (
        <mesh key={i} position={[x, H / 2, 0.07]}>
          <boxGeometry args={[0.36, H * 0.78, 0.012]} />
          <meshStandardMaterial color="#5a3818" roughness={0.85} />
        </mesh>
      ))}

      {/* Brass kickplate */}
      <mesh position={[0, 0.25, 0.062]}>
        <boxGeometry args={[W * 0.85, 0.4, 0.005]} />
        <meshStandardMaterial color="#c08443" roughness={0.45} metalness={0.65} />
      </mesh>

      {/* Door handle */}
      <mesh position={[W / 2 - 0.18, H / 2 - 0.1, 0.07]}>
        <cylinderGeometry args={[0.04, 0.04, 0.16, 12]} />
        <meshStandardMaterial color="#d4a259" roughness={0.4} metalness={0.85} />
      </mesh>

      {/* Sign above the door — "BASKETBALL" with neon orange glow */}
      <group position={[0, H + 0.5, 0]}>
        <mesh>
          <boxGeometry args={[W + 0.6, 0.55, 0.18]} />
          <meshStandardMaterial
            ref={signRef}
            color="#1f0a02"
            emissive="#f97316"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        <Text
          position={[0, 0, 0.12]}
          fontSize={0.24}
          color="#1a0500"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          fontWeight={700}
        >
          🏀  BASKETBALL
        </Text>
      </group>

      {/* Floating "ENTER" hint above the sign */}
      <group ref={arrowRef} position={[0, H + 1.0, 0]}>
        <Text
          fontSize={0.18}
          color="#fff"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          outlineWidth={0.012}
          outlineColor="#1a0500"
        >
          ↓ ENTER ↓
        </Text>
      </group>

      {/* Floor accent — orange court line in front of the door */}
      <mesh position={[0, 0.005, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.22} toneMapped={false} />
      </mesh>

      {/* Pin light on the door */}
      <pointLight
        position={[0, H + 0.4, 0.5]}
        color="#fbbf24"
        intensity={hovered ? 2.8 : 1.6}
        distance={6}
        decay={1.8}
      />
    </group>
  )
}

export function WeightStack({ position }: { position: [number, number, number] }): JSX.Element {
  const plates: Array<{ y: number; r: number; color: string }> = [
    { y: 0.06, r: 0.48, color: '#dc2626' },
    { y: 0.18, r: 0.44, color: '#1a1a1a' },
    { y: 0.30, r: 0.40, color: '#facc15' },
    { y: 0.40, r: 0.36, color: '#1a1a1a' },
    { y: 0.48, r: 0.32, color: '#10b981' },
    { y: 0.56, r: 0.28, color: '#1a1a1a' },
  ]
  return (
    <group position={position}>
      {plates.map((p, i) => (
        <mesh key={i} position={[0, p.y, 0]} castShadow>
          <cylinderGeometry args={[p.r, p.r, 0.1, 28]} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={p.color === '#1a1a1a' ? 0 : 0.15}
            roughness={0.55}
            metalness={0.25}
          />
        </mesh>
      ))}
      {/* Support post */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.7, 10]} />
        <meshStandardMaterial color="#2a2825" roughness={0.4} metalness={0.8} />
      </mesh>
    </group>
  )
}
