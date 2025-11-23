import { METERS, NOTE_PALETTE, SCALES } from '$lib/constants/music';
import {
	TICKS_PER_BEAT,
	type MeterId,
	type PlacementCandidate,
	type PlacementValidation,
	type PlacedNote,
	type ScaleId
} from '$lib/types/composer';

export const ticksFromBeats = (beats: number) => Math.round(beats * TICKS_PER_BEAT);

export const beatsFromTicks = (ticks: number) => ticks / TICKS_PER_BEAT;

export interface ValidateOptions {
	meter: MeterId;
	notes: PlacedNote[];
	candidate: PlacementCandidate;
	ignoreNoteId?: string;
	noteDefinitionId?: string;
	groupType?: PlacedNote['groupType'];
	groupIndex?: number;
}

const SIXTEENTH_TICKS = TICKS_PER_BEAT / 4;
const isTripletNote = (noteDefinitionId?: string, groupType?: PlacedNote['groupType']) =>
	noteDefinitionId === 'triplet-eighth' || groupType === 'triplet-eighth';

export const validatePlacement = ({
	meter,
	notes,
	candidate,
	ignoreNoteId,
	noteDefinitionId,
	groupType,
	groupIndex
}: ValidateOptions): PlacementValidation => {
	const meterDef = METERS[meter];
	const totalTicks = meterDef.totalBeats * TICKS_PER_BEAT;
	const measureTicks = meterDef.beatsPerMeasure * TICKS_PER_BEAT;
	const { startTick, durationTicks, rowIndex } = candidate;

	if (startTick < 0) {
		return { ok: false, reason: 'Before grid start' };
	}

	if (startTick + durationTicks > totalTicks) {
		return { ok: false, reason: 'Exceeds grid length' };
	}

	const beatOffset = startTick % TICKS_PER_BEAT;
	const isTriplet = isTripletNote(noteDefinitionId, groupType);
	const tripletNeedsAnchor = isTriplet && (groupIndex === undefined || groupIndex === 0);
	if (isTriplet) {
		if (tripletNeedsAnchor && beatOffset !== 0) {
			return { ok: false, reason: 'Triplets must start on the first 16th of a beat' };
		}
	} else if (durationTicks > SIXTEENTH_TICKS) {
		if (beatOffset !== 0 && beatOffset !== SIXTEENTH_TICKS * 2) {
			return { ok: false, reason: 'The note must start on the beat or on the offbeat' };
		}
	}

	const startMeasure = Math.floor(startTick / measureTicks);
	const endMeasure = Math.floor((startTick + durationTicks - 1) / measureTicks);
	if (startMeasure !== endMeasure) {
		return { ok: false, reason: 'Crosses barline' };
	}

	const overlapping = notes.some((note) => {
		if (note.rowIndex !== rowIndex) return false;
		if (ignoreNoteId && note.id === ignoreNoteId) return false;
		const noteEnd = note.startTick + note.durationTicks;
		const candEnd = startTick + durationTicks;
		return !(candEnd <= note.startTick || startTick >= noteEnd);
	});

	if (overlapping) {
		return { ok: false, reason: 'Row already occupied' };
	}

	return { ok: true };
};

export const getScaleRows = (scaleId: ScaleId) => SCALES[scaleId].rows;

export const getNoteDefinition = (noteDefinitionId: string) =>
	NOTE_PALETTE.find((note) => note.id === noteDefinitionId);
