import type { JSX } from 'react'

/**
 * Static gym equipment — bench press with loaded bar, dumbbell pair, stacked weight plates.
 * All built from primitive geometries; no external meshes.
 */

export function BenchPress({ position }: { position: [number, number, number] }): JSX.Element {
  return (
    <group position={position}>
      {/* Bench pad */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.55, 0.16, 1.9]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.75} metalness={0.15} />
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

      {/* Barbell */}
      <group position={[0, 1.7, 0.3]}>
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
