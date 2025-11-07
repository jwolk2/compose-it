import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgressLoop } from './progressLoop';

	let pendingCallback: ((timestamp: number) => void) | null = null;

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

afterEach(() => {
	pendingCallback = null;
});

	describe('createProgressLoop', () => {
		it('waits for playback start before updating progress', async () => {
			const loop = createProgressLoop<number>();
			const updates: number[] = [];
			let resolveStart!: () => void;
			const started = new Promise<void>((resolve) => {
				resolveStart = resolve;
			});
			const startPromise = loop.start({
				started,
				sample: () => 0.5,
				onUpdate: (value) => {
					updates.push(value);
					loop.stop();
				}
			});

			await Promise.resolve();
			expect(updates).toHaveLength(0);

			resolveStart();
			await startPromise;

			expect(updates).toEqual([0.5]);
		});

		it('stops scheduling frames when stopped', async () => {
			const loop = createProgressLoop<number>();
			const updates: number[] = [];
			await loop.start({
				started: Promise.resolve(),
				sample: () => 0.25,
				onUpdate: (value) => updates.push(value)
			});

			expect(updates).toEqual([0.25]);

			const nextFrame = pendingCallback;
			pendingCallback = null;
			if (!nextFrame) {
				throw new Error('No frame scheduled');
			}
			nextFrame(16);
			expect(updates).toEqual([0.25, 0.25]);

			const postStopFrame = pendingCallback;
			loop.stop();
			if (postStopFrame) {
				(postStopFrame as (timestamp: number) => void)(16);
			}
			expect(updates).toEqual([0.25, 0.25]);
		});
	});
