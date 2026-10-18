/**
 * Scripted technician prompts for the Copilot: the technician taps a chip instead of typing.
 * The two photo prompts attach the catalog presets of the demo story (CNC-02 / T07):
 * the removed worn insert and the newly fitted insert, so Gemini answers from the image.
 */
export interface CopilotPrompt {
  id: string;
  /** Short chip label. */
  label: string;
  icon: string;
  /** Text sent to the Copilot as the technician's turn. */
  text: string;
  /** Catalog preset photo attached to the turn (resolved to an image by the backend). */
  presetId?: string;
  /** Thumbnail of that preset, shown next to the technician's turn. */
  photoUrl?: string;
}

export const WORN_INSERT_PRESET_ID = 'preset-cnc02-tool-worn-insert-commons-bautsch-cc0';
export const NEW_INSERT_PRESET_ID = 'preset-cnc02-tool-new-insert-commons-raizy-1';

export function copilotPrompts(machine: string, tool: string): CopilotPrompt[] {
  return [
    {
      id: 'diagnosis',
      label: 'What is wrong?',
      icon: 'troubleshoot',
      text: `What is the defect on ${machine} and what is causing it?`,
    },
    {
      id: 'show-removed-insert',
      label: 'Show removed insert',
      icon: 'photo_camera',
      text: `This is the ${tool} insert I just removed. What do you see?`,
      presetId: WORN_INSERT_PRESET_ID,
      photoUrl: '/presets/evidence/cnc02/tool_worn_insert_commons_bautsch_cc0.jpg',
    },
    {
      id: 'replacement-procedure',
      label: 'Replacement steps',
      icon: 'build',
      text: `Walk me through replacing the ${tool} insert and give me the torque from the SOP.`,
    },
    {
      id: 'confirm-new-insert',
      label: 'New insert fitted',
      icon: 'verified',
      text: `I fitted the new ${tool} insert. Please check it.`,
      presetId: NEW_INSERT_PRESET_ID,
      photoUrl: '/presets/evidence/cnc02/tool_new_insert_commons_raizy_1.jpg',
    },
    {
      id: 'before-restart',
      label: 'Before restart',
      icon: 'play_circle',
      text: `What should I check before restarting ${machine}?`,
    },
  ];
}
