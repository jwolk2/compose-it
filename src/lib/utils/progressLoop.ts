interface ProgressLoopOptions<T> {
	started: Promise<void>;
	sample: () => T;
	onUpdate: (value: T) => void;
}

const fallbackTimers = new Map<number, ReturnType<typeof setTimeout>>();
let fallbackId = 0;

const fallbackRAF = (callback: FrameRequestCallback) => {
	const id = ++fallbackId;
	const timer = setTimeout(() => {
		fallbackTimers.delete(id);
		callback(Date.now());
	}, 16);
	fallbackTimers.set(id, timer);
	return id;
};

const fallbackCAF = (id: number) => {
	const timer = fallbackTimers.get(id);
	if (timer) {
		clearTimeout(timer);
		fallbackTimers.delete(id);
	}
};

const getRAF = () =>
	typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function'
		? globalThis.requestAnimationFrame.bind(globalThis)
		: fallbackRAF;

const getCAF = () =>
	typeof globalThis !== 'undefined' && typeof globalThis.cancelAnimationFrame === 'function'
		? globalThis.cancelAnimationFrame.bind(globalThis)
		: fallbackCAF;

export const createProgressLoop = <T = number>() => {
	let rafId: number | null = null;
	let active = false;

	const stop = () => {
		if (rafId !== null) {
			getCAF()(rafId);
			rafId = null;
		}
		active = false;
	};

	const start = async ({ started, sample, onUpdate }: ProgressLoopOptions<T>) => {
		await started;
		stop();
		active = true;
		const tick = () => {
			if (!active) return;
			onUpdate(sample());
			rafId = getRAF()(tick);
		};
		tick();
	};

	return { start, stop };
};
