// Animated robot figure for one agent: it turns toward the direction its next data leaves in;
// while working it hops, squashes, leans, shimmies and flaps its arms with glowing eyes; on hover
// it turns to the viewer and waves its right hand with bright eyes and a small hop.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Quaternion, Vector3 } from 'three';
import type { AnimationAction, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { headingAt, isAgentWorking, scenarioAt, scenarioNow } from '../data/topology';

// "Futuristic flying animated Robot - Low Poly" by mshayan02 (Sketchfab), CC BY 4.0.
const MODEL_URL = '/models/agent-robot.glb';
/** Model is 0.87 units tall; scale it to roughly the height of the other nodes. */
const SCALE = 2.4;
/** Eye material name in the glTF. */
const LIGHT_MATERIAL = 'Blue_Light';
/** Body shell material name in the glTF. */
const BODY_MATERIAL = 'White_Glossy';
const IDLE_GLOW = 0.6;
const ACTIVE_GLOW = 4;
/** Model forward is local +z, so yaw θ faces world (sin θ, cos θ); π/4 faces the default camera. */
const DEFAULT_YAW = Math.PI / 4;
/** OrbitControls target, used if the controls are not available. */
const FALLBACK_TARGET = new Vector3(-8, 0, -8);

/** Hand pivots sit at ear height; about -Y a positive angle swings the hand outward and up. */
const HAND_AXIS = new Vector3(0, -1, 0);
const handTurn = new Quaternion();
const wavePose = new Quaternion();

function turnHand(hand: Object3D | null, angle: number): void {
  if (!hand) return;
  hand.quaternion.multiply(handTurn.setFromAxisAngle(HAND_AXIS, angle));
}

interface AgentRobotProps {
  agentId: string;
  hovered: boolean;
  size: number;
}

export default function AgentRobot({ agentId, hovered, size }: AgentRobotProps): React.ReactElement {
  const { scene, animations } = useGLTF(MODEL_URL);
  const body = useRef<Group>(null);
  const root = useRef<Group>(null);
  const action = useRef<AnimationAction | null>(null);
  /** 0 idle .. 1 working, eased toward the scenario state each frame. */
  const work = useRef(0);
  /** 0 idle .. 1 greeting, eased toward the hover state each frame. */
  const greet = useRef(0);
  /** Current facing yaw, damped toward the data heading (or the viewer while hovered). */
  const yaw = useRef(DEFAULT_YAW);
  const hover = useRef(hovered);
  hover.current = hovered;

  // Per-instance copy with its own light materials so only this robot's eyes glow.
  const { model, lights, rightHand, rightRest, leftHand } = useMemo(() => {
    const copy = scene.clone(true);
    const glowing: MeshStandardMaterial[] = [];
    const hands: Object3D[] = [];
    copy.traverse((obj) => {
      if (obj.name.startsWith('Hand_origin')) hands.push(obj);
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = material;
      // Sketchfab export is metallic; the scene has no env map, so metal renders grey.
      material.metalness = 0;
      // Lift the shell to the white of the reference look under the scene's soft lights.
      if (material.name === BODY_MATERIAL) material.emissive.set('#ffffff').multiplyScalar(0.35);
      if (material.name === LIGHT_MATERIAL) glowing.push(material);
    });
    hands.sort((a, b) => b.position.x - a.position.x);
    return {
      model: copy,
      lights: glowing,
      rightHand: hands[0] ?? null,
      /** Rest pose of the waving hand; the greeting replaces the clip pose rather than adding to it. */
      rightRest: hands[0]?.quaternion.clone() ?? null,
      leftHand: hands[1] ?? null,
    };
  }, [scene]);

  const { actions } = useAnimations(animations, root);
  useEffect(() => {
    const clip = Object.values(actions)[0];
    clip?.reset().play();
    action.current = clip ?? null;
    return () => {
      clip?.stop();
    };
  }, [actions]);

  // Registered after useAnimations, so this runs after the mixer and adds on top of the clip pose.
  useFrame((state) => {
    const t = scenarioNow();
    work.current += ((isAgentWorking(agentId, t) ? 1 : 0) - work.current) * 0.12;
    greet.current += ((hover.current ? 1 : 0) - greet.current) * 0.15;
    const w = work.current;
    const g = greet.current;
    if (action.current) action.current.timeScale = 0.3 + 1.5 * w;

    const b = body.current;
    if (b) {
      const h = Math.abs(Math.sin(t * 5));
      b.position.y = Math.sin(t * 1.5) * 0.03 * (1 - w) + h * 0.45 * w + g * 0.15;
      const sy = 1 + 0.12 * (h - 0.5) * w;
      const sxz = 1 - 0.06 * (h - 0.5) * w;
      b.scale.set(sxz, sy, sxz);
      b.rotation.z = Math.sin(t * 5) * 0.18 * w;
      b.rotation.y = Math.sin(t * 2.5) * 0.35 * w;
    }

    if (root.current) {
      let face = headingAt(agentId, scenarioAt(t).index) ?? DEFAULT_YAW;
      if (hover.current) {
        const controls = state.controls as { target?: Vector3 } | null;
        const target = controls?.target ?? FALLBACK_TARGET;
        face = Math.atan2(state.camera.position.x - target.x, state.camera.position.z - target.z);
      }
      let d = face - yaw.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw.current += d * 0.1;
      root.current.rotation.y = yaw.current;
    }

    const flap = Math.sin(t * 12) * 0.7 * w;
    turnHand(rightHand, flap);
    turnHand(leftHand, flap * (1 - g));
    if (rightHand && rightRest && g > 0.001) {
      // 1.9..2.5 rad keeps the waving hand up beside the head; past ~2.7 the head hides it.
      wavePose.copy(rightRest).multiply(handTurn.setFromAxisAngle(HAND_AXIS, 2.2 + Math.sin(t * 9) * 0.3));
      rightHand.quaternion.slerp(wavePose, g);
    }

    const glow = IDLE_GLOW + (ACTIVE_GLOW - IDLE_GLOW) * Math.max(w, g);
    for (const m of lights) m.emissiveIntensity = glow;
  });

  // Yaw of `root` is driven per frame above.
  return (
    <group ref={body}>
      <group ref={root} scale={SCALE * size}>
        <primitive object={model} />
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
