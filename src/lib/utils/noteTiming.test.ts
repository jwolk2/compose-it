import { describe, expect, it } from 'vitest';
import { gridDurationSeconds, secondsPerBeatFromBpm, ticksToSeconds, getNoteWindowSeconds } from './noteTiming';
import { TICKS_PER_BEAT } from '$lib/types/composer';

const sampleNote = (startBeats: number, durationBeats: number) => ({
	id: 'n1',
	noteDefinitionId: 'quarter',
	rowIndex: 0,
	startTick: startBeats * TICKS_PER_BEAT,
	durationTicks: durationBeats * TICKS_PER_BEAT,
	color: 0xffffff,
	pitch: 'C4'
});

describe('note timing utilities', () => {
	it('converts ticks to seconds consistently across tempos', () => {
		const bpm = 120;
		const seconds = ticksToSeconds(TICKS_PER_BEAT * 2, bpm);
		expect(seconds).toBeCloseTo(1);
	});

	it('computes grid duration for meters', () => {
		const duration = gridDurationSeconds('4/4', 60);
		expect(duration).toBeCloseTo(16);
	});

	it('returns correct note windows for varying tempos', () => {
		const note = sampleNote(2, 1);
		const slow = getNoteWindowSeconds(note, 60);
		const fast = getNoteWindowSeconds(note, 120);
		expect(slow.start).toBeCloseTo(2);
		expect(fast.start).toBeCloseTo(1);
		expect(slow.end - slow.start).toBeCloseTo(secondsPerBeatFromBpm(60));
		expect(fast.end - fast.start).toBeCloseTo(secondsPerBeatFromBpm(120));
	});
});
