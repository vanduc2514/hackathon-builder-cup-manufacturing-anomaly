// Animated robot figure for one agent; while the agent is working it moves faster, bobs, wobbles
// and its eyes light up.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { AnimationAction, Group, Mesh, MeshStandardMaterial } from 'three';
import { isAgentWorking, scenarioNow } from '../data/topology';

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

interface AgentRobotProps {
  agentId: string;
}

export default function AgentRobot({ agentId }: AgentRobotProps): React.ReactElement {
  const { scene, animations } = useGLTF(MODEL_URL);
  const body = useRef<Group>(null);
  const root = useRef<Group>(null);
  const action = useRef<AnimationAction | null>(null);
  /** 0 idle .. 1 working, eased toward the scenario state each frame. */
  const work = useRef(0);

  // Per-instance copy with its own light materials so only this robot's eyes glow.
  const { model, lights } = useMemo(() => {
    const copy = scene.clone(true);
    const glowing: MeshStandardMaterial[] = [];
    copy.traverse((obj) => {
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
    return { model: copy, lights: glowing };
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

  useFrame(() => {
    const t = scenarioNow();
    const working = isAgentWorking(agentId, t);
    work.current += ((working ? 1 : 0) - work.current) * 0.12;
    const w = work.current;
    if (action.current) action.current.timeScale = 0.3 + 1.5 * w;
    if (body.current) {
      body.current.position.y = Math.sin(t * (1.5 + 5 * w)) * (0.03 + 0.1 * w);
      body.current.rotation.y = Math.sin(t * 3) * 0.25 * w;
    }
    const glow = IDLE_GLOW + (ACTIVE_GLOW - IDLE_GLOW) * w;
    for (const m of lights) m.emissiveIntensity = glow;
  });

  // Face the isometric camera, which looks from +x/+z.
  return (
    <group ref={body}>
      <group ref={root} scale={SCALE} rotation={[0, Math.PI / 4, 0]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
