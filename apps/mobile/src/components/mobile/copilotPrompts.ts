/**
 * Scripted technician prompts for the Copilot: the technician taps a chip instead of typing.
 * One photo chip follows the demo story (CNC-02 / T07): it first attaches the removed worn insert,
 * then, once that photo was sent, the newly fitted insert, so Gemini answers from the image.
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
export const WORN_INSERT_PHOTO_URL = '/presets/evidence/cnc02/tool_worn_insert_commons_bautsch_cc0.jpg';

/** `removedInsertShown`: the worn-insert photo was already sent, so the photo chip checks the new one. */
export function copilotPrompts(machine: string, tool: string, removedInsertShown: boolean): CopilotPrompt[] {
  const photoPrompt: CopilotPrompt = removedInsertShown
    ? {
        id: 'confirm-new-insert',
        label: 'Show new insert',
        icon: 'photo_camera',
        text: `I fitted the new ${tool} insert. Please check it.`,
        presetId: NEW_INSERT_PRESET_ID,
        photoUrl: '/presets/evidence/cnc02/tool_new_insert_commons_raizy_1.jpg',
      }
    : {
        id: 'show-removed-insert',
        label: 'Show removed insert',
        icon: 'photo_camera',
        text: `This is the ${tool} insert I just removed. What do you see?`,
        presetId: WORN_INSERT_PRESET_ID,
        photoUrl: WORN_INSERT_PHOTO_URL,
      };
  return [
    {
      id: 'diagnosis',
      label: 'What is wrong?',
      icon: 'troubleshoot',
      text: `What is the defect on ${machine} and what is causing it?`,
    },
    photoPrompt,
    {
      id: 'replacement-procedure',
      label: 'Replacement steps',
      icon: 'build',
      text: `Walk me through replacing the ${tool} insert and give me the torque from the SOP.`,
    },
    {
      id: 'before-restart',
      label: 'Before restart',
      icon: 'play_circle',
      text: `What should I check before restarting ${machine}?`,
    },
  ];
}
