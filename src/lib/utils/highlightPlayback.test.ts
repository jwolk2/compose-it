import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createProgressLoop } from './progressLoop';
import { isNoteActive } from './highlight';
import { TICKS_PER_BEAT } from '$lib/types/composer';

interface Snapshot {
	ratio: number;
	elapsedSeconds: number;
}

const note = {
	id: 'n1',
	noteDefinitionId: 'quarter',
	rowIndex: 0,
	startTick: 2 * TICKS_PER_BEAT,
	durationTicks: TICKS_PER_BEAT,
	color: 0xffffff,
	pitch: 'C4'
};

let pendingCallback: FrameRequestCallback | null = null;

beforeEach(() => {
	pendingCallback = null;
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		pendingCallback = cb;
		return 1;
	}) as unknown as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = vi.fn(() => {
		pendingCallback = null;
	}) as unknown as typeof cancelAnimationFrame;
});

describe('playback-highlight sync', () => {
	it('lights notes at the exact onset times for multiple tempos', async () => {
		const loop = createProgressLoop<Snapshot>();
		const bpm = 120;
		const noteStartSeconds = (note.startTick / TICKS_PER_BEAT) * (60 / bpm);
		const snapshots: Snapshot[] = [
			{ ratio: 0, elapsedSeconds: 0 },
			{ ratio: 0.25, elapsedSeconds: noteStartSeconds },
			{ ratio: 0.4, elapsedSeconds: noteStartSeconds + 0.1 },
			{ ratio: 0.8, elapsedSeconds: noteStartSeconds + (60 / bpm) + 0.05 }
		];
		let index = 0;
		const activeStates: boolean[] = [];

		await loop.start({
			started: Promise.resolve(),
			sample: () => snapshots[Math.min(index, snapshots.length - 1)],
			onUpdate: (snapshot) => {
				const active = isNoteActive(note, snapshot.elapsedSeconds, bpm);
				activeStates.push(active);
				index += 1;
				if (index >= snapshots.length) loop.stop();
			}
		});

		while (pendingCallback) {
			const cb = pendingCallback;
			pendingCallback = null;
			cb(Date.now());
		}

		expect(activeStates).toEqual([false, true, true, false]);
	});
});
