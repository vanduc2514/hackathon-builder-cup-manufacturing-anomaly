// Animated robot figure for one agent; its eyes light up while the agent is working.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { isAgentActive } from '../data/topology';

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
  const root = useRef<Group>(null);

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
    return () => {
      clip?.stop();
    };
  }, [actions]);

  useFrame(({ clock }) => {
    const target = isAgentActive(agentId, clock.elapsedTime) ? ACTIVE_GLOW : IDLE_GLOW;
    for (const m of lights) m.emissiveIntensity += (target - m.emissiveIntensity) * 0.2;
  });

  // Face the isometric camera, which looks from +x/+z.
  return (
    <group ref={root} scale={SCALE} rotation={[0, Math.PI / 4, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
