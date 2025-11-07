import { describe, expect, it } from 'vitest';
import { isNoteActive } from './highlight';
import { TICKS_PER_BEAT } from '$lib/types/composer';

const note = {
	id: 'n1',
	noteDefinitionId: 'quarter',
	rowIndex: 0,
	startTick: 2 * TICKS_PER_BEAT,
	durationTicks: TICKS_PER_BEAT,
	color: 0xffffff,
	pitch: 'C4'
};

describe('highlight synchronization', () => {
	it('activates exactly at note onset for multiple tempos', () => {
		const bpmValues = [60, 80, 120];
		for (const bpm of bpmValues) {
			const startSeconds = (note.startTick / TICKS_PER_BEAT) * (60 / bpm);
			const active = isNoteActive(note, startSeconds, bpm);
			expect(active).toBe(true);
			const before = isNoteActive(note, startSeconds - 0.02, bpm);
			expect(before).toBe(false);
			const after = isNoteActive(note, startSeconds + (60 / bpm) + 0.05, bpm);
			expect(after).toBe(false);
		}
	});
});
