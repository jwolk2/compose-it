export const TICKS_PER_BEAT = 12;

export type MeterId = '4/4' | '3/4';
export type ScaleId = 'c-major' | 'c-pentatonic' | 'a-harmonic-minor';
export type TempoId = 'adagio' | 'andante' | 'allegro';

export interface MeterDefinition {
	id: MeterId;
	label: string;
	measures: number;
	beatsPerMeasure: number;
	totalBeats: number;
}

export interface ScaleDefinition {
	id: ScaleId;
	label: string;
	rows: string[];
	description: string;
}

export interface NoteDefinition {
	id: string;
	label: string;
	color: number;
	durationBeats: number;
	durationTicks: number;
	description: string;
	restrictTo?: MeterId[];
}

export interface PlacedNote {
	id: string;
	noteDefinitionId: string;
	rowIndex: number;
	startTick: number;
	durationTicks: number;
	color: number;
	pitch: string;
}

export interface Motif {
	id: string;
	name: string;
	notes: Array<{
		noteDefinitionId: string;
		rowOffset: number;
		startTickOffset: number;
		durationTicks: number;
	}>;
	widthTicks: number;
	rowSpan: number;
}

export interface ComposerState {
	meter: MeterId;
	scaleId: ScaleId;
	tempo: TempoId;
	notes: PlacedNote[];
	motifs: Motif[];
	backgroundImage?: string;
	updatedAt: number;
	compositionName: string;
}

export interface PlacementValidation {
	ok: boolean;
	reason?: string;
}

export interface PlacementCandidate {
	rowIndex: number;
	startTick: number;
	durationTicks: number;
}

export type DragKind = 'palette' | 'note' | 'motif';

export interface DragPayload {
	kind: DragKind;
	noteDefinitionId: string;
	noteId?: string;
	motifId?: string;
	durationTicks: number;
}

export interface ExportRequest {
	name: string;
	options: ExportKind[];
}

export type ExportKind = 'grid-pdf' | 'notation-pdf' | 'audio' | 'both' | 'json';

export interface TempoOption {
	id: TempoId;
	label: string;
	bpm: number;
}
