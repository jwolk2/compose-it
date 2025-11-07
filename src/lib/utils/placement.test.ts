import { describe, expect, it } from 'vitest';
import { validatePlacement, ticksFromBeats } from './placement';

const baseCandidate = { rowIndex: 0, startTick: 0, durationTicks: ticksFromBeats(1) };

describe('validatePlacement', () => {
	it('allows placement within boundaries', () => {
		const result = validatePlacement({ meter: '4/4', notes: [], candidate: baseCandidate });
		expect(result.ok).toBe(true);
	});

	it('rejects overlapping notes on the same row', () => {
		const result = validatePlacement({
			meter: '4/4',
			notes: [
				{
					id: 'note-1',
					noteDefinitionId: 'quarter',
					rowIndex: 0,
					startTick: 0,
					durationTicks: ticksFromBeats(1),
					color: 0xffffff,
					pitch: 'C4'
				}
			],
			candidate: { ...baseCandidate, startTick: ticksFromBeats(0.5) }
		});
		expect(result.ok).toBe(false);
	});

	it('allows overlapping on different rows', () => {
		const result = validatePlacement({
			meter: '4/4',
			notes: [
				{
					id: 'note-1',
					noteDefinitionId: 'quarter',
					rowIndex: 1,
					startTick: 0,
					durationTicks: ticksFromBeats(1),
					color: 0xffffff,
					pitch: 'D4'
				}
			],
			candidate: baseCandidate
		});
		expect(result.ok).toBe(true);
	});

	it('rejects placements that cross barlines', () => {
		const result = validatePlacement({
			meter: '4/4',
			notes: [],
			candidate: { rowIndex: 0, startTick: ticksFromBeats(3.5), durationTicks: ticksFromBeats(1) }
		});
		expect(result.ok).toBe(false);
	});
});
