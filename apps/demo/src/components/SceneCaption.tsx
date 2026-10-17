// Pill naming the current step of the looping incident scenario.
import React, { useEffect, useState } from 'react';
import { SCENARIO, scenarioAt, scenarioNow } from '../data/topology';

export default function SceneCaption(): React.ReactElement {
  const [index, setIndex] = useState(() => scenarioAt(scenarioNow()).index);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = scenarioAt(scenarioNow()).index;
      setIndex((prev) => (prev === current ? prev : current));
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="scene-caption" role="status" aria-live="off">
      <span className="scene-caption__step">
        {index + 1}/{SCENARIO.length}
      </span>
      <span>{SCENARIO[index].caption}</span>
    </div>
  );
}
