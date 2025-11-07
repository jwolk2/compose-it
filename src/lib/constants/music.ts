import type {
	MeterDefinition,
	MeterId,
	NoteDefinition,
	ScaleDefinition,
	TempoOption,
	TempoId
} from '$lib/types/composer';
import { TICKS_PER_BEAT } from '$lib/types/composer';

const toColor = (hex: string) => parseInt(hex.replace('#', ''), 16);

export const METERS: Record<MeterId, MeterDefinition> = {
	'4/4': {
		id: '4/4',
		label: '4/4 — four pulses',
		measures: 4,
		beatsPerMeasure: 4,
		totalBeats: 16
	},
	'3/4': {
		id: '3/4',
		label: '3/4 — three pulses',
		measures: 4,
		beatsPerMeasure: 3,
		totalBeats: 12
	}
};

const asc = <T>(values: T[]) => [...values].reverse();
const C_MAJOR_ROWS = asc(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
const C_PENTATONIC_ROWS = asc(['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
const A_HARMONIC_ROWS = asc(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G#5', 'A5']);

export const SCALES: Record<string, ScaleDefinition> = {
	'c-major': {
		id: 'c-major',
		label: 'C Major Diatonic',
		rows: C_MAJOR_ROWS,
		description: 'C–D–E–F–G–A–B repeating C3–C5'
	},
	'c-pentatonic': {
		id: 'c-pentatonic',
		label: 'C Pentatonic',
		rows: C_PENTATONIC_ROWS,
		description: 'C–D–E–G–A repeating C3–C5'
	},
	'a-harmonic-minor': {
		id: 'a-harmonic-minor',
		label: 'A Harmonic Minor',
		rows: A_HARMONIC_ROWS,
		description: 'A–B–C–D–E–F–G# repeating A3–A5'
	}
};

const buildNote = (config: Omit<NoteDefinition, 'durationTicks'>): NoteDefinition => ({
	...config,
	durationTicks: Math.round(config.durationBeats * TICKS_PER_BEAT)
});

export const NOTE_PALETTE: NoteDefinition[] = [
	buildNote({
		id: 'whole',
		label: 'Whole — 4 beats',
		color: toColor('#e74c3c'),
		description: 'Whole note (4 beats). Only valid in 4/4.',
		durationBeats: 4,
		restrictTo: ['4/4']
	}),
	buildNote({
		id: 'dotted-half',
		label: 'Dotted Half — 3 beats',
		color: toColor('#f39c12'),
		description: 'Dotted half (3 beats).',
		durationBeats: 3
	}),
	buildNote({
		id: 'half',
		label: 'Half — 2 beats',
		color: toColor('#f1c40f'),
		description: 'Half note (2 beats).',
		durationBeats: 2
	}),
	buildNote({
		id: 'dotted-quarter',
		label: 'Dotted Quarter — 1.5 beats',
		color: toColor('#27ae60'),
		description: 'Dotted quarter (1.5 beats).',
		durationBeats: 1.5
	}),
	buildNote({
		id: 'quarter',
		label: 'Quarter — 1 beat',
		color: toColor('#5dade2'),
		description: 'Quarter note (1 beat).',
		durationBeats: 1
	}),
	buildNote({
		id: 'dotted-eighth',
		label: 'Dotted Eighth — 0.75 beat',
		color: toColor('#1f618d'),
		description: 'Dotted eighth (0.75 beat).',
		durationBeats: 0.75
	}),
	buildNote({
		id: 'eighth',
		label: 'Eighth — 0.5 beat',
		color: toColor('#ff6fa6'),
		description: 'Eighth note (0.5 beat).',
		durationBeats: 0.5
	}),
	buildNote({
		id: 'triplet-eighth',
		label: 'Triplet Eighth — 0.33 beat',
		color: toColor('#8e5b2d'),
		description: 'Triplet eighth (⅓ beat).',
		durationBeats: 1 / 3
	}),
	buildNote({
		id: 'sixteenth',
		label: 'Sixteenth — 0.25 beat',
		color: toColor('#8e44ad'),
		description: 'Sixteenth note (0.25 beat).',
		durationBeats: 0.25
	})
];

export const TEMPOS: TempoOption[] = [
	{ id: 'adagio', label: 'Adagio · 60 BPM', bpm: 60 },
	{ id: 'andante', label: 'Andante · 80 BPM', bpm: 80 },
	{ id: 'allegro', label: 'Allegro · 120 BPM', bpm: 120 }
];

export const DEFAULT_TEMPO: TempoId = 'andante';
