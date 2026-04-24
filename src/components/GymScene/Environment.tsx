import * as THREE from 'three'

const FLOOR_SIZE = 40
const WALL_HEIGHT = 8
const ROOM = 14

/**
 * Sun-drenched glass-walled gym — polished wood floor, floor-to-ceiling glass on
 * three sides with steel mullions, a clear skylight in the roof, and a warm
 * directional sun pouring in from the upper-left.
 */
export function Environment() {
  return (
    <group>
      {/* Sky gradient — a large inverted sphere that fills the background */}
      <mesh scale={[100, 100, 100]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          toneMapped={false}
          vertexColors={false}
          color="#bfe3ff"
        />
      </mesh>

      {/* A softer gradient rim by offsetting a second larger sphere with lower opacity */}
      <mesh>
        <sphereGeometry args={[80, 32, 16]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          color="#f4e7c8"
          transparent
          opacity={0.45}
          toneMapped={false}
        />
      </mesh>

      {/* Polished floor — light wood-toned */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#c9a377" roughness={0.55} metalness={0.1} />
      </mesh>

      {/* Floor seams — thin lighter stripes running lengthwise */}
      {[-6, -2, 2, 6].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, 0]}>
          <planeGeometry args={[0.05, FLOOR_SIZE]} />
          <meshBasicMaterial color="#a07e56" toneMapped={false} />
        </mesh>
      ))}

      {/* Painted lane — still visible on the light floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[2.2, FLOOR_SIZE * 0.7]} />
        <meshStandardMaterial color="#b08854" roughness={0.6} />
      </mesh>

      {/* Glass walls — transparent with a slight blue tint + steel mullion frames */}
      <GlassWall position={[0, WALL_HEIGHT / 2, -ROOM]}       size={[FLOOR_SIZE, WALL_HEIGHT]} />
      <GlassWall position={[-ROOM, WALL_HEIGHT / 2, 0]}       size={[FLOOR_SIZE, WALL_HEIGHT]} rotation={[0, Math.PI / 2, 0]} />
      <GlassWall position={[ROOM, WALL_HEIGHT / 2, 0]}        size={[FLOOR_SIZE, WALL_HEIGHT]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Ceiling with skylight strip down the middle */}
      {/* Opaque roof panels on either side of the skylight */}
      <mesh position={[-5, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE * 0.35, FLOOR_SIZE]} />
        <meshStandardMaterial color="#eadfc9" roughness={0.85} />
      </mesh>
      <mesh position={[5, WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE * 0.35, FLOOR_SIZE]} />
        <meshStandardMaterial color="#eadfc9" roughness={0.85} />
      </mesh>
      {/* Skylight glass */}
      <mesh position={[0, WALL_HEIGHT - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE * 0.3, FLOOR_SIZE]} />
        <meshStandardMaterial
          color="#e8f4ff"
          transparent
          opacity={0.18}
          emissive="#ffffff"
          emissiveIntensity={0.6}
          roughness={0.1}
        />
      </mesh>

      {/* Skylight mullions (crossbars every few meters) */}
      {[-8, -4, 0, 4, 8].map((z, i) => (
        <mesh key={i} position={[0, WALL_HEIGHT - 0.04, z]}>
          <boxGeometry args={[FLOOR_SIZE * 0.32, 0.08, 0.2]} />
          <meshStandardMaterial color="#5a5046" roughness={0.55} metalness={0.45} />
        </mesh>
      ))}

      {/* I-beams flanking the skylight */}
      {[-2.2, 2.2].map((x, i) => (
        <mesh key={i} position={[x, WALL_HEIGHT - 0.15, 0]}>
          <boxGeometry args={[0.35, 0.3, FLOOR_SIZE]} />
          <meshStandardMaterial color="#5a5046" roughness={0.55} metalness={0.5} />
        </mesh>
      ))}

      {/* ── Lighting ────────────────────────────────────────────────────────── */}

      {/* Key — warm sun pouring in from the upper-left */}
      <directionalLight
        position={[-12, 18, 8]}
        intensity={2.4}
        color="#fff3d4"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />

      {/* Fill — cool sky bounce from the opposite side */}
      <directionalLight
        position={[10, 14, -4]}
        intensity={0.7}
        color="#d5e8ff"
      />

      {/* Skylight glow — a soft downward spot from dead center */}
      <spotLight
        position={[0, WALL_HEIGHT - 0.2, 0]}
        target-position={[0, 0, 0]}
        angle={1.0}
        penumbra={0.85}
        intensity={1.8}
        color="#fff8e0"
        distance={22}
      />

      {/* Ambient daylight + hemisphere for natural sky/ground color balance */}
      <ambientLight intensity={0.55} color="#fff6e3" />
      <hemisphereLight args={['#bfe3ff', '#caa67a', 0.6]} />
    </group>
  )
}

function GlassWall({
  position,
  size,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  size: [number, number]
  rotation?: [number, number, number]
}) {
  const [w, h] = size
  const mullionsV = 6
  const mullionsH = 3
  return (
    <group position={position} rotation={rotation}>
      {/* Glass pane — very transparent, slight blue cool */}
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#cfe4ff"
          transparent
          opacity={0.12}
          roughness={0.05}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floor/ceiling trim */}
      <mesh position={[0, -h / 2 + 0.08, 0]}>
        <boxGeometry args={[w, 0.18, 0.25]} />
        <meshStandardMaterial color="#2c2420" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, h / 2 - 0.08, 0]}>
        <boxGeometry args={[w, 0.18, 0.25]} />
        <meshStandardMaterial color="#2c2420" roughness={0.55} metalness={0.4} />
      </mesh>

      {/* Vertical mullions */}
      {Array.from({ length: mullionsV }).map((_, i) => {
        const x = -w / 2 + ((i + 1) * w) / (mullionsV + 1)
        return (
          <mesh key={`v${i}`} position={[x, 0, 0.01]}>
            <boxGeometry args={[0.08, h - 0.25, 0.1]} />
            <meshStandardMaterial color="#2c2420" roughness={0.55} metalness={0.4} />
          </mesh>
        )
      })}

      {/* Horizontal mullion cross-bars */}
      {Array.from({ length: mullionsH }).map((_, i) => {
        const y = -h / 2 + ((i + 1) * h) / (mullionsH + 1)
        return (
          <mesh key={`h${i}`} position={[0, y, 0.01]}>
            <boxGeometry args={[w - 0.3, 0.06, 0.08]} />
            <meshStandardMaterial color="#2c2420" roughness={0.55} metalness={0.4} />
          </mesh>
        )
      })}
    </group>
  )
}
