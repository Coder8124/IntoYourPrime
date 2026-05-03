import { useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text, useCursor } from '@react-three/drei'
import * as THREE from 'three'

const MACHINE_W = 2.2
const MACHINE_H = 4.2
const MACHINE_D = 1.1

/** Canonical drink catalog — each slot in the machine is one of these. */
export type Drink = {
  id: string
  name: string     // "ELECTRIC"
  flavor: string   // "citrus cool"
  color: string    // hex
}

export const DRINKS: Drink[] = [
  { id: 'electric', name: 'ELECTRIC', flavor: 'citrus cool',  color: '#22d3ee' },
  { id: 'ember',    name: 'EMBER',    flavor: 'mango heat',   color: '#f59e0b' },
  { id: 'mint',     name: 'MINT',     flavor: 'cool recovery',color: '#5eead4' },
  { id: 'crimson',  name: 'CRIMSON',  flavor: 'blood orange', color: '#ef4444' },
  { id: 'grape',    name: 'GRAPE',    flavor: 'neon purple',  color: '#a78bfa' },
  { id: 'bolt',     name: 'BOLT',     flavor: 'lemon torque', color: '#facc15' },
]

const CAN_R = 0.17
const CAN_H = 0.42
const COL_X = [-0.62, 0, 0.62]            // 3 columns
const ROW_Y = [MACHINE_H * 0.76, MACHINE_H * 0.54]  // 2 rows
const SLOT_Y = 0.6                        // Delivery slot Y in world (from machine origin)

/** The fixed rest position of can #i in the rack, in the machine's local space.
 *  Cans sit in front of the dark screen plane so they read against the glow. */
function canRestPosition(i: number): [number, number, number] {
  const row = Math.floor(i / 3)
  const col = i % 3
  return [COL_X[col], ROW_Y[row], MACHINE_D / 2 + 0.02]
}

type DispenseState =
  | { phase: 'idle' }
  | { phase: 'falling'; drinkIndex: number; startedAt: number }
  | { phase: 'tray';    drinkIndex: number; startedAt: number }
  | { phase: 'done';    drinkIndex: number }

const FALL_MS = 700
const TRAY_SLIDE_MS = 500

/**
 * Interactive vending machine — the user picks a specific drink from the rack,
 * it drops into the slot, slides onto the front tray, and fires `onDispensed`.
 */
export function VendingMachine({
  position = [0, 0, 0] as [number, number, number],
  onDispensed,
}: {
  position?: [number, number, number]
  onDispensed: (drink: Drink, trayWorldPos: THREE.Vector3) => void
}) {
  const facade = useRef<THREE.MeshStandardMaterial>(null)
  const arrowRef = useRef<THREE.Group>(null)
  const canRefs = useRef<(THREE.Group | null)[]>([])
  const groupRef = useRef<THREE.Group>(null)

  const [hoveredCan, setHoveredCan] = useState<number | null>(null)
  const [dispense, setDispense] = useState<DispenseState>({ phase: 'idle' })
  useCursor(hoveredCan !== null && dispense.phase === 'idle')

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    // Breathing neon on the façade
    const pulse = 0.72 + Math.sin(t * 2.2) * 0.28
    if (facade.current) facade.current.emissiveIntensity = 1.3 + pulse * 0.9

    // Bobbing arrow only while idle
    if (arrowRef.current) {
      arrowRef.current.position.y = dispense.phase === 'idle'
        ? Math.sin(t * 3) * 0.08
        : THREE.MathUtils.damp(arrowRef.current.position.y, -4, 6, 0.05) // flies away
      arrowRef.current.visible = dispense.phase === 'idle'
    }

    // Drive dispense animation
    if (dispense.phase !== 'idle' && dispense.phase !== 'done') {
      const now = performance.now()
      const drink = dispense.drinkIndex
      const can = canRefs.current[drink]
      if (!can) return

      if (dispense.phase === 'falling') {
        const k = Math.min(1, (now - dispense.startedAt) / FALL_MS)
        const rest = canRestPosition(drink)
        // Ease: accelerating fall
        const eased = k * k
        can.position.y = rest[1] + (SLOT_Y - rest[1]) * eased
        can.position.x = rest[0] + (0 - rest[0]) * eased
        can.position.z = rest[2]
        can.rotation.z = eased * Math.PI * 0.6
        if (k >= 1) {
          setDispense({ phase: 'tray', drinkIndex: drink, startedAt: now })
        }
      } else if (dispense.phase === 'tray') {
        const k = Math.min(1, (now - dispense.startedAt) / TRAY_SLIDE_MS)
        const eased = 1 - Math.pow(1 - k, 3) // ease-out cubic
        const rest = canRestPosition(drink)
        const trayZ = MACHINE_D / 2 + 0.55
        can.position.y = SLOT_Y - 0.35 * eased
        can.position.x = 0
        can.position.z = rest[2] + (trayZ - rest[2]) * eased
        can.rotation.z = Math.PI * 0.6 - eased * Math.PI * 0.1
        if (k >= 1 && groupRef.current) {
          const trayPos = new THREE.Vector3(0, SLOT_Y - 0.35, trayZ)
          trayPos.applyMatrix4(groupRef.current.matrixWorld)
          setDispense({ phase: 'done', drinkIndex: drink })
          onDispensed(DRINKS[drink], trayPos)
        }
      }
    }
  })

  const handleCanClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (dispense.phase !== 'idle') return
    setDispense({ phase: 'falling', drinkIndex: i, startedAt: performance.now() })
  }

  return (
    <group ref={groupRef} position={position}>
      {/* Main body */}
      <mesh position={[0, MACHINE_H / 2, 0]} castShadow>
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

      {/* Screen cavity */}
      <mesh position={[0, MACHINE_H * 0.65, MACHINE_D / 2 + 0.002]}>
        <planeGeometry args={[MACHINE_W * 0.86, MACHINE_H * 0.46]} />
        <meshStandardMaterial
          color="#0a0208"
          emissive="#a21caf"
          emissiveIntensity={0.8}
          roughness={0.3}
        />
      </mesh>

      {/* Drink rack — 6 clickable cans */}
      {DRINKS.map((drink, i) => {
        const rest = canRestPosition(i)
        const hovered = hoveredCan === i
        return (
          <group
            key={drink.id}
            ref={(g) => { canRefs.current[i] = g }}
            position={rest}
          >
            {/* Hover backdrop — shows a bright halo behind the can on hover only */}
            {hovered && (
              <mesh position={[0, 0, -0.08]}>
                <planeGeometry args={[CAN_R * 3.5, CAN_H * 1.7]} />
                <meshBasicMaterial color={drink.color} transparent opacity={0.42} toneMapped={false} />
              </mesh>
            )}

            {/* The can itself */}
            <mesh
              onClick={handleCanClick(i)}
              onPointerOver={(e) => { e.stopPropagation(); if (dispense.phase === 'idle') setHoveredCan(i) }}
              onPointerOut={() => setHoveredCan(h => h === i ? null : h)}
              castShadow
            >
              <cylinderGeometry args={[CAN_R, CAN_R, CAN_H, 18]} />
              <meshStandardMaterial
                color={drink.color}
                emissive={drink.color}
                emissiveIntensity={hovered ? 1.0 : 0.45}
                roughness={0.32}
                metalness={0.82}
              />
            </mesh>

            {/* Drink label strip (bright band) */}
            <mesh>
              <cylinderGeometry args={[CAN_R + 0.002, CAN_R + 0.002, CAN_H * 0.38, 18, 1, true]} />
              <meshBasicMaterial color={drink.color} transparent opacity={0.95} toneMapped={false} />
            </mesh>

            {/* Drink name label below the can */}
            <Text
              position={[0, -CAN_H * 0.62, 0.01]}
              fontSize={0.085}
              color={hovered ? drink.color : '#8888aa'}
              anchorX="center"
              anchorY="middle"
              fontWeight={700}
              letterSpacing={0.18}
              outlineWidth={hovered ? 0.004 : 0}
              outlineColor="#000"
            >
              {drink.name}
            </Text>
            {/* Flavor subtitle */}
            <Text
              position={[0, -CAN_H * 0.9, 0.01]}
              fontSize={0.058}
              color={hovered ? '#d4d4e8' : '#3a3a52'}
              anchorX="center"
              anchorY="middle"
              letterSpacing={0.1}
            >
              {drink.flavor.toUpperCase()}
            </Text>
          </group>
        )
      })}

      {/* Hover callout — name + flavor floating beside the rack */}
      {hoveredCan !== null && dispense.phase === 'idle' && (
        <group position={[0, 0.3, MACHINE_D / 2 + 0.5]}>
          <mesh>
            <planeGeometry args={[1.8, 0.5]} />
            <meshBasicMaterial color="#07050b" transparent opacity={0.82} />
          </mesh>
          <Text
            position={[0, 0.08, 0.01]}
            fontSize={0.16}
            color={DRINKS[hoveredCan].color}
            fontWeight={700}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.05}
            outlineWidth={0.01}
            outlineColor="#000"
          >
            {DRINKS[hoveredCan].name}
          </Text>
          <Text
            position={[0, -0.12, 0.01]}
            fontSize={0.08}
            color="#b4b4c8"
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.12}
          >
            {DRINKS[hoveredCan].flavor.toUpperCase()}
          </Text>
        </group>
      )}

      {/* Delivery slot */}
      <mesh position={[0, SLOT_Y, MACHINE_D / 2 + 0.003]}>
        <planeGeometry args={[MACHINE_W * 0.7, 0.42]} />
        <meshStandardMaterial color="#050104" roughness={0.9} />
      </mesh>

      {/* Front tray lip (visible when can is dispensed) */}
      <mesh position={[0, SLOT_Y - 0.35, MACHINE_D / 2 + 0.4]}>
        <boxGeometry args={[MACHINE_W * 0.65, 0.04, 0.5]} />
        <meshStandardMaterial color="#0a0208" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Top crown sign — "PICK A DRINK" when idle, "DISPENSING…" when in action */}
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
          fontSize={0.3}
          color="#1a1500"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          fontWeight={700}
        >
          {dispense.phase === 'idle' ? 'PICK A DRINK' : 'DISPENSING…'}
        </Text>
      </group>

      {/* Floating bobbing arrow */}
      <group ref={arrowRef} position={[0, MACHINE_H + 1.55, 0]}>
        <Text
          fontSize={0.34}
          color="#facc15"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          outlineWidth={0.02}
          outlineColor="#1a1500"
        >
          ↓  TAP A CAN  ↓
        </Text>
      </group>

      {/* Ground glow puddle */}
      <mesh position={[0, 0.01, MACHINE_D * 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#ec4899" transparent opacity={0.38} toneMapped={false} />
      </mesh>

      {/* Fill lights */}
      <pointLight position={[0, MACHINE_H * 0.6, MACHINE_D]} color="#ec4899" intensity={3} distance={10} decay={1.6} />
      <pointLight position={[0, MACHINE_H + 0.5, 0.4]} color="#facc15" intensity={1.2} distance={6} decay={1.8} />
    </group>
  )
}
