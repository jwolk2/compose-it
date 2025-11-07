import { browser } from '$app/environment';
import * as Tone from 'tone';
import type { ComposerState, TempoId } from '$lib/types/composer';
import { TEMPOS } from '$lib/constants/music';
import { gridDurationSeconds, ticksToSeconds } from '$lib/utils/noteTiming';
import { audioBufferToWav, toneBufferToAudioBuffer } from '$lib/utils/audio';

const SYNTH_OPTIONS = {
	volume: -6,
	oscillator: { type: 'fattriangle' },
	envelope: {
		attack: 0.05,
		decay: 0.3,
		sustain: 0.4,
		release: 1.4,
		attackCurve: 'linear',
		decayCurve: 'exponential',
		releaseCurve: 'exponential'
	}
} as Tone.SynthOptions;

let synth: Tone.PolySynth<Tone.Synth> | null = null;
let reverb: Tone.Reverb | null = null;
let chorus: Tone.Chorus | null = null;
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

const ensureInstrument = async () => {
	if (!synth) {
		reverb = new Tone.Reverb({ decay: 4.3, wet: 0.45 });
		await reverb.generate();
		chorus = new Tone.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.7, wet: 0.35 }).start();
		const filter = new Tone.Filter({ type: 'lowpass', frequency: 1900, rolloff: -24 });
		synth = new Tone.PolySynth(Tone.Synth, SYNTH_OPTIONS);
		synth.chain(filter, chorus, reverb, Tone.Destination);
	}
	return synth;
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
		const synth = new Tone.PolySynth(Tone.Synth, SYNTH_OPTIONS).toDestination();
		transport.bpm.value = bpm;
		events.forEach((event) => {
			synth.triggerAttackRelease(event.pitch, event.duration, event.time);
		});
	}, offlineDuration);
	const audioBuffer = toneBufferToAudioBuffer(toneBuffer);
	return audioBufferToWav(audioBuffer);
};
