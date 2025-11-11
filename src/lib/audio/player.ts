import { browser } from '$app/environment';
import * as Tone from 'tone';
import type { ComposerState, TempoId } from '$lib/types/composer';
import { TEMPOS } from '$lib/constants/music';
import { gridDurationSeconds, ticksToSeconds } from '$lib/utils/noteTiming';
import { audioBufferToWav, toneBufferToAudioBuffer } from '$lib/utils/audio';

type SamplerConfig = Pick<Tone.SamplerOptions, 'urls' | 'baseUrl'> &
	Partial<Omit<Tone.SamplerOptions, 'urls' | 'baseUrl'>>;

const PIANO_SAMPLER_OPTIONS: SamplerConfig = {
	baseUrl: 'https://tonejs.github.io/audio/salamander/',
	release: 0.75,
	urls: {
		A2: 'A2.mp3',
		C3: 'C3.mp3',
		'D#3': 'Ds3.mp3',
		'F#3': 'Fs3.mp3',
		A3: 'A3.mp3',
		C4: 'C4.mp3',
		'D#4': 'Ds4.mp3',
		'F#4': 'Fs4.mp3',
		A4: 'A4.mp3'
	}
};

const HORN_SAMPLER_OPTIONS: SamplerConfig = {
	baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/french_horn-mp3/',
	attack: 0.03,
	release: 1.4,
	urls: {
		C2: 'C2.mp3',
		E2: 'E2.mp3',
		G2: 'G2.mp3',
		B2: 'B2.mp3',
		D3: 'D3.mp3',
		F3: 'F3.mp3',
		A3: 'A3.mp3',
		C4: 'C4.mp3',
		E4: 'E4.mp3'
	}
};

const createSampler = (config: SamplerConfig) => {
	let resolveLoad: (() => void) | null = null;
	let rejectLoad: ((error: Error) => void) | null = null;
	const loaded = new Promise<void>((resolve, reject) => {
		resolveLoad = resolve;
		rejectLoad = reject;
	});
	const { onload, onerror, ...rest } = config;
	const sampler = new Tone.Sampler({
		...(rest as Tone.SamplerOptions),
		urls: config.urls,
		baseUrl: config.baseUrl,
		onload: () => {
			resolveLoad?.();
			onload?.();
		},
		onerror: (error) => {
			rejectLoad?.(error);
			onerror?.(error);
		}
	});
	return { sampler, loaded };
};

interface LayeredInstrument {
	triggerAttackRelease: (pitch: string, duration: number, time: number, velocity?: number) => void;
	dispose: () => void;
}

let layeredInstrument: LayeredInstrument | null = null;
let layeredInstrumentPromise: Promise<LayeredInstrument> | null = null;
let part: Tone.Part | null = null;
let playbackDuration = 0;
let playbackStart = 0;
let scheduledStart: number | null = null;
let pendingStartResolve: (() => void) | null = null;
let contextConfigured = false;

const getTempoValue = (tempo: TempoId) => TEMPOS.find((entry) => entry.id === tempo)?.bpm ?? 80;

const configureContext = () => {
	if (contextConfigured) return;
	const ctx = Tone.getContext();
	ctx.lookAhead = 0;
	if ('latencyHint' in (ctx as unknown as { latencyHint?: string })) {
		try {
			((ctx as unknown) as AudioContext & { latencyHint?: string }).latencyHint = 'interactive';
		} catch {
			// Some runtimes expose latencyHint as read-only.
		}
	}
	const transport = Tone.getTransport() as { lookAhead?: number; updateInterval?: number };
	if (transport.lookAhead !== undefined) transport.lookAhead = 0;
	if (transport.updateInterval !== undefined) transport.updateInterval = 0.02;
	contextConfigured = true;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const createLayeredInstrument = async (): Promise<LayeredInstrument> => {
	const { sampler: piano, loaded: pianoLoaded } = createSampler(PIANO_SAMPLER_OPTIONS);
	const { sampler: horn, loaded: hornLoaded } = createSampler(HORN_SAMPLER_OPTIONS);

	const pianoFilter = new Tone.Filter({ type: 'lowpass', frequency: 5200, rolloff: -12 });
	const pianoGain = new Tone.Gain(0.8);

	const hornColor = new Tone.Filter({ type: 'lowshelf', frequency: 220, gain: 3 });
	const hornPresence = new Tone.Filter({ type: 'highshelf', frequency: 3800, gain: -4 });
	const hornChorus = new Tone.Chorus({ frequency: 0.25, delayTime: 4.2, depth: 0.18, wet: 0.1 }).start();
	const hornGain = new Tone.Gain(0.7);

	const mix = new Tone.Gain(0.95);
	const compressor = new Tone.Compressor({ threshold: -24, ratio: 2.1, attack: 0.008, release: 0.24 });
	const masterGain = new Tone.Gain(0.88);
	const reverbSend = new Tone.Gain(0.28);
	const reverb = new Tone.Reverb({ decay: 2.6, wet: 0.24 });

	piano.chain(pianoFilter, pianoGain, mix);
	horn.chain(hornColor, hornPresence, hornChorus, hornGain, mix);

	mix.chain(compressor, masterGain, Tone.Destination);
	mix.connect(reverbSend);
	reverbSend.connect(reverb);
	reverb.connect(Tone.Destination);

	await Promise.all([pianoLoaded, hornLoaded, reverb.generate()]);

	return {
		triggerAttackRelease: (pitch, duration, time, velocity = 0.85) => {
			const vel = clamp(velocity);
			const midi = Tone.Frequency(pitch).toMidi();
			piano.triggerAttackRelease(pitch, duration, time, Math.min(1, vel * 0.9));

			const hornWeight = clamp(1 - Math.max(0, midi - 67) / 20); // fade horn above ~D5
			if (hornWeight > 0.05) {
				const hornDuration = duration + 0.18;
				horn.triggerAttackRelease(pitch, hornDuration, time, clamp(vel * hornWeight));
			}
		},
		dispose: () => {
			piano.dispose();
			horn.dispose();
			pianoFilter.dispose();
			pianoGain.dispose();
			hornColor.dispose();
			hornPresence.dispose();
			hornChorus.dispose();
			hornGain.dispose();
			mix.dispose();
			compressor.dispose();
			masterGain.dispose();
			reverbSend.dispose();
			reverb.dispose();
		}
	};
};

const ensureInstrument = async () => {
	if (layeredInstrument) return layeredInstrument;
	if (!layeredInstrumentPromise) {
		layeredInstrumentPromise = createLayeredInstrument()
			.then((instance) => {
				layeredInstrument = instance;
				return instance;
			})
			.finally(() => {
				layeredInstrumentPromise = null;
			});
	}
	return layeredInstrumentPromise;
};


const buildEvents = (state: ComposerState) => {
	const bpm = getTempoValue(state.tempo);
	const gridDuration = gridDurationSeconds(state.meter, bpm);
	const events = state.notes
		.map((note) => ({
			time: ticksToSeconds(note.startTick, bpm),
			pitch: note.pitch,
			duration: Math.max(0.01, ticksToSeconds(note.durationTicks, bpm))
		}))
		.sort((a, b) => a.time - b.time);
	const lastEventEnd = events.length ? Math.max(...events.map((event) => event.time + event.duration)) : 0;
	const duration = Math.max(gridDuration, lastEventEnd);
	return { events, duration, bpm };
};

const clearScheduledStart = () => {
	if (scheduledStart !== null) {
		Tone.Transport.clear(scheduledStart);
		scheduledStart = null;
	}
	if (pendingStartResolve) {
		pendingStartResolve();
		pendingStartResolve = null;
	}
	playbackStart = 0;
};

const disposePart = () => {
	if (part) {
		part.stop();
		part.dispose();
		part = null;
	}
};

export const play = async (state: ComposerState) => {
	if (!browser) return { duration: 0, started: Promise.resolve() };
	await Tone.start();
	configureContext();
	const { events, duration, bpm } = buildEvents(state);
	if (!events.length) return { duration: 0, started: Promise.resolve() };
	const instrument = await ensureInstrument();
	await stop();
	Tone.Transport.bpm.value = bpm;
	const partPayload = events.map((event) => ({
		time: event.time,
		pitch: event.pitch,
		duration: event.duration
	}));
	part = new Tone.Part<{ time: number; pitch: string; duration: number }>((time, value) => {
		instrument.triggerAttackRelease(value.pitch, value.duration, time, 0.85);
	}, partPayload);
	part.start(0).stop(duration + 0.5);
	playbackDuration = duration;
	clearScheduledStart();
	const started = new Promise<void>((resolve) => {
		pendingStartResolve = resolve;
	});
	const startDelay = 0.001;
	scheduledStart = Tone.Transport.scheduleOnce(() => {
		playbackStart = Tone.now();
		if (pendingStartResolve) {
			pendingStartResolve();
			pendingStartResolve = null;
		}
		scheduledStart = null;
	}, startDelay);
	Tone.Transport.start(`+${startDelay}`);
	return { duration, started };
};

export const stop = async () => {
	if (!browser) return;
	Tone.Transport.stop();
	Tone.Transport.cancel(0);
	Tone.Transport.position = 0;
	clearScheduledStart();
	disposePart();
	playbackStart = 0;
};

export interface ProgressSnapshot {
	ratio: number;
	elapsedSeconds: number;
}

export const getProgress = (duration: number): ProgressSnapshot => {
	if (!browser || !duration) {
		return { ratio: 0, elapsedSeconds: 0 };
	}
	const total = playbackDuration || duration;
	const elapsed = Math.min(total, Math.max(0, Tone.Transport.seconds));
	const ratio = total > 0 ? Math.min(1, elapsed / total) : 0;
	return { ratio, elapsedSeconds: elapsed };
};

export const recordWav = async (state: ComposerState) => {
	if (!browser) return null;
	const { events, duration, bpm } = buildEvents(state);
	if (!events.length) return null;
	const offlineDuration = duration + 0.5;
	const toneBuffer = await Tone.Offline(async ({ transport }) => {
		const instrument = await createLayeredInstrument();
		transport.bpm.value = bpm;
		events.forEach((event) => {
			instrument.triggerAttackRelease(event.pitch, event.duration, event.time);
		});
		transport.scheduleOnce(() => {
			instrument.dispose();
		}, offlineDuration + 0.1);
	}, offlineDuration);
	const audioBuffer = toneBufferToAudioBuffer(toneBuffer);
	return audioBufferToWav(audioBuffer);
};
