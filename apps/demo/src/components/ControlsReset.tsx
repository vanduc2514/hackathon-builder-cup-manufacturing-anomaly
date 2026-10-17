// Saves the initial OrbitControls framing and restores it whenever resetToken changes.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

interface ResettableControls {
  saveState: () => void;
  reset: () => void;
}

interface ControlsResetProps {
  resetToken: number;
}

function isResettable(controls: unknown): controls is ResettableControls {
  return (
    typeof controls === 'object' &&
    controls !== null &&
    typeof (controls as ResettableControls).reset === 'function' &&
    typeof (controls as ResettableControls).saveState === 'function'
  );
}

export default function ControlsReset({ resetToken }: ControlsResetProps): null {
  const controls = useThree((s) => s.controls);

  // drei applies the `target` prop after constructing OrbitControls, so the state saved by the
  // constructor points at the origin; re-save once the configured framing is in place.
  useEffect(() => {
    if (isResettable(controls)) controls.saveState();
  }, [controls]);

  useEffect(() => {
    if (resetToken > 0 && isResettable(controls)) controls.reset();
  }, [resetToken, controls]);

  return null;
}
