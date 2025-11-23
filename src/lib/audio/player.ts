import { browser } from '$app/environment';
import * as Tone from 'tone';
import type { ComposerState, TempoId } from '$lib/types/composer';
import { TEMPOS } from '$lib/constants/music';
import { gridDurationSeconds, ticksToSeconds } from '$lib/utils/noteTiming';
import { audioBufferToWav, toneBufferToAudioBuffer } from '$lib/utils/audio';

const PLAYBACK_TAIL_SECONDS = 1.5;
const RELEASE_FADE_SECONDS = 0.35;
const MIN_HORN_WEIGHT = 0.25;

interface LayeredInstrument {
	triggerAttackRelease: (pitch: string, duration: number, time: number, velocity?: number) => void;
	releaseAll: () => void;
	restoreLevel: () => void;
	dispose: () => void;
}

let layeredInstrument: LayeredInstrument | null = null;
let layeredInstrumentPromise: Promise<LayeredInstrument> | null = null;
let part: Tone.Part | null = null;
let playbackDuration = 0;
let playbackStart = 0;
let playbackOffset = 0;
let scheduledStart: number | null = null;
let pendingStartResolve: (() => void) | null = null;
let contextConfigured = false;
let pendingTailReset: ReturnType<typeof setTimeout> | null = null;

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

type SamplerConfig = Pick<Tone.SamplerOptions, 'urls' | 'baseUrl'> &
	Partial<Omit<Tone.SamplerOptions, 'urls' | 'baseUrl'>>;

const PIANO_SAMPLER_OPTIONS: SamplerConfig = {
	baseUrl: 'https://tonejs.github.io/audio/salamander/',
	release: 0.35,
	attack: 0.004,
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
	attack: 0.012,
	release: 0.4,
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

const createLayeredInstrument = async (): Promise<LayeredInstrument> => {
	const destination = Tone.getDestination();
	const { sampler: piano, loaded: pianoLoaded } = createSampler(PIANO_SAMPLER_OPTIONS);
	const { sampler: horn, loaded: hornLoaded } = createSampler(HORN_SAMPLER_OPTIONS);

	const pianoBody = new Tone.Filter({ type: 'lowpass', frequency: 6800, Q: 0.6 });
	const pianoTrim = new Tone.Filter({ type: 'highpass', frequency: 140 });
	const pianoGain = new Tone.Gain(0.82);

	const hornFocus = new Tone.Filter({ type: 'bandpass', frequency: 780, Q: 0.8 });
	const hornTrim = new Tone.Filter({ type: 'highpass', frequency: 240 });
	const hornGain = new Tone.Gain(0.7);

	const mix = new Tone.Gain(1);
	const compressor = new Tone.Compressor({ threshold: -22, ratio: 3, attack: 0.01, release: 0.25 });
	const limiter = new Tone.Limiter(-6);
	const sheenTamer = new Tone.Filter({ type: 'lowpass', frequency: 7200, Q: 0.4 });
	const BASE_LEVEL = 0.95;
	const BASE_SEND = 0.06;
	const BASE_WET = 0.06;
	const masterGain = new Tone.Gain(BASE_LEVEL);
	const reverbSend = new Tone.Gain(BASE_SEND);
	const reverb = new Tone.Reverb({ decay: 1.6, wet: BASE_WET, highCut: 5200, lowCut: 180 });

	piano.chain(pianoBody, pianoTrim, pianoGain, mix);
	horn.chain(hornFocus, hornTrim, hornGain, mix);

	mix.chain(compressor, limiter, sheenTamer, masterGain, destination);
	mix.connect(reverbSend);
	reverbSend.connect(reverb);
	reverb.connect(destination);

	await Promise.all([pianoLoaded, hornLoaded, reverb.generate()]);

	return {
		triggerAttackRelease: (pitch, duration, time, velocity = 0.85) => {
			const vel = clamp(velocity);
			const midi = Tone.Frequency(pitch).toMidi();
			const dynamic = Math.min(1, vel * 0.95);
			const sustainDuration = Math.max(0.04, duration);
			const pianoLevel = clamp(dynamic * 0.9);
			piano.triggerAttackRelease(pitch, sustainDuration, time, pianoLevel);

			const hornWeight = clamp(1 - Math.max(0, midi - 68) / 18, MIN_HORN_WEIGHT);
			if (hornWeight > 0.05) {
				const hornLevel = clamp(dynamic * hornWeight * 0.65);
				horn.triggerAttackRelease(pitch, sustainDuration, time, hornLevel);
			}
		},
		releaseAll: () => {
			const now = Tone.now();
			piano.releaseAll?.(now);
			horn.releaseAll?.(now);
			const fadeTarget = now + RELEASE_FADE_SECONDS;
			masterGain.gain.cancelScheduledValues(now);
			masterGain.gain.setValueAtTime(masterGain.gain.value, now);
			masterGain.gain.linearRampToValueAtTime(0, fadeTarget);
			reverbSend.gain.cancelScheduledValues(now);
			reverbSend.gain.setValueAtTime(reverbSend.gain.value, now);
			reverbSend.gain.linearRampToValueAtTime(0, fadeTarget);
			reverb.wet.cancelScheduledValues(now);
			reverb.wet.setValueAtTime(reverb.wet.value, now);
			reverb.wet.linearRampToValueAtTime(0, fadeTarget);
		},
		restoreLevel: () => {
			const now = Tone.now();
			masterGain.gain.cancelScheduledValues(now);
			masterGain.gain.setValueAtTime(BASE_LEVEL, now);
			reverbSend.gain.cancelScheduledValues(now);
			reverbSend.gain.setValueAtTime(BASE_SEND, now);
			reverb.wet.cancelScheduledValues(now);
			reverb.wet.setValueAtTime(BASE_WET, now);
		},
		dispose: () => {
			const now = Tone.now();
			piano.releaseAll?.(now);
			horn.releaseAll?.(now);
			piano.dispose();
			horn.dispose();
			pianoBody.dispose();
			pianoTrim.dispose();
			pianoGain.dispose();
			hornFocus.dispose();
			hornTrim.dispose();
			hornGain.dispose();
			mix.dispose();
			compressor.dispose();
			limiter.dispose();
			sheenTamer.dispose();
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
		.map((note) => {
			const time = ticksToSeconds(note.startTick, bpm);
			const duration = Math.max(0.04, ticksToSeconds(note.durationTicks, bpm));
			return { time, pitch: note.pitch, duration };
		})
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

const finalizeStopState = () => {
	layeredInstrument?.releaseAll?.();
	disposePart();
	playbackStart = 0;
	playbackOffset = 0;
};

export const play = async (state: ComposerState, startSeconds = 0) => {
	if (!browser) return { duration: 0, started: Promise.resolve() };
	await Tone.start();
	configureContext();
	const { events, duration, bpm } = buildEvents(state);
	if (!events.length) return { duration: 0, started: Promise.resolve() };
	const offset = Math.min(Math.max(startSeconds, 0), duration);
	const instrument = await ensureInstrument();
	await stop();
	instrument.restoreLevel();
	playbackDuration = duration + PLAYBACK_TAIL_SECONDS;
	playbackOffset = offset;
	Tone.Transport.bpm.value = bpm;
	const partPayload = events
		.map((event) => {
			const eventEnd = event.time + event.duration;
			if (eventEnd <= offset) return null;
			const start = Math.max(event.time, offset);
			const trimmedDuration = Math.max(0.01, eventEnd - start);
			return {
				time: start - offset,
				pitch: event.pitch,
				duration: trimmedDuration
			};
		})
		.filter(Boolean) as { time: number; pitch: string; duration: number }[];
	if (!partPayload.length) {
		playbackStart = 0;
		return { duration: 0, started: Promise.resolve() };
	}
	part = new Tone.Part<{ time: number; pitch: string; duration: number }>((time, value) => {
		instrument.triggerAttackRelease(value.pitch, value.duration, time, 0.85);
	}, partPayload);
	const remainingDuration = Math.max(0, duration - offset);
	part.start(0).stop(remainingDuration + PLAYBACK_TAIL_SECONDS);
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

export const stop = async ({ allowTail = false }: { allowTail?: boolean } = {}) => {
	if (!browser) return;
	if (pendingTailReset) {
		clearTimeout(pendingTailReset);
		pendingTailReset = null;
	}
	Tone.Transport.stop();
	Tone.Transport.cancel(0);
	Tone.Transport.position = 0;
	clearScheduledStart();
	playbackStart = 0;
	playbackOffset = 0;
	if (allowTail) {
		part?.stop();
		pendingTailReset = setTimeout(() => {
			pendingTailReset = null;
			finalizeStopState();
		}, PLAYBACK_TAIL_SECONDS * 1000);
	} else {
		finalizeStopState();
	}
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
	const elapsedSegment = Math.max(0, Tone.Transport.seconds);
	const elapsed = Math.min(total, playbackOffset + elapsedSegment);
	const ratio = total > 0 ? Math.min(1, elapsed / total) : 0;
	return { ratio, elapsedSeconds: elapsed };
};

export const recordWav = async (state: ComposerState) => {
	if (!browser) return null;
	const { events, duration, bpm } = buildEvents(state);
	if (!events.length) return null;
	const offlineDuration = duration + PLAYBACK_TAIL_SECONDS;
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
