import { METERS } from '$lib/constants/music';
import { TICKS_PER_BEAT, type MeterId, type PlacedNote } from '$lib/types/composer';

export const secondsPerBeatFromBpm = (bpm: number) => 60 / bpm;

export const ticksToSeconds = (ticks: number, bpm: number) => (ticks / TICKS_PER_BEAT) * secondsPerBeatFromBpm(bpm);

export const gridDurationSeconds = (meter: MeterId, bpm: number) => METERS[meter].totalBeats * secondsPerBeatFromBpm(bpm);

export const getNoteWindowSeconds = (note: PlacedNote, bpm: number) => {
	const start = ticksToSeconds(note.startTick, bpm);
	const end = start + ticksToSeconds(note.durationTicks, bpm);
	return { start, end };
};
