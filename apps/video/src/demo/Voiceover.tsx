import React from 'react';
import { Audio } from '@remotion/media';
import { Sequence, Track, staticFile } from 'remotion';
import type { Line } from './timeline';

/** One audio clip per narration line, placed at its speech start (public/voiceover/<id>.mp3). */
export default function Voiceover({ lines }: { lines: Line[] }): React.ReactElement {
  return (
    <Track name="Voiceover">
      {lines.map((line) => (
        <Sequence key={line.id} name={line.id} from={line.from + line.speechAt} durationInFrames={line.speech + 6}>
          <Audio src={staticFile(`voiceover/${line.id}.mp3`)} />
        </Sequence>
      ))}
    </Track>
  );
}
