import type { PlacedNote } from '$lib/types/composer';
import { getNoteWindowSeconds } from './noteTiming';

const START_EPSILON = 0.004; // seconds tolerance for onsets
const END_EPSILON = 0.008;

export const isNoteActive = (note: PlacedNote, progressSeconds: number, bpm: number) => {
	const { start, end } = getNoteWindowSeconds(note, bpm);
	return progressSeconds >= start - START_EPSILON && progressSeconds <= end + END_EPSILON;
};
