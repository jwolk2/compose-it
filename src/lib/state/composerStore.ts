import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import {
	DEFAULT_TEMPO,
	METERS,
	NOTE_PALETTE,
	SCALES,
	TEMPOS
} from '$lib/constants/music';
import type {
	ComposerState,
	MeterId,
	Motif,
	NoteDefinition,
	PlacementCandidate,
	PlacementValidation,
	ScaleId,
	TempoId,
	PlacedNote
} from '$lib/types/composer';
import { validatePlacement } from '$lib/utils/placement';

export const AUTOSAVE_KEY = 'compose-it-autosave-v1';
export const FORCE_CLEAR_FLAG = 'compose-it-force-clear';

const baseState = (): ComposerState => ({
	meter: '4/4',
	scaleId: 'c-major',
	tempo: DEFAULT_TEMPO,
	notes: [],
	motifs: [],
	updatedAt: Date.now(),
	compositionName: 'Untitled',
	backgroundImage: undefined
});

const alignNotesWithScale = (notes: PlacedNote[], scaleId: ScaleId) => {
	const rows = SCALES[scaleId].rows;
	return notes.map((note) => {
		const idx = rows.indexOf(note.pitch);
		return idx === -1 ? note : { ...note, rowIndex: idx };
	});
};

const safeParse = (value: string | null): ComposerState | null => {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as ComposerState;
		if (!parsed.meter || !parsed.scaleId) return null;
		return {
			...baseState(),
			...parsed,
			notes: alignNotesWithScale(parsed.notes ?? [], parsed.scaleId),
			motifs: parsed.motifs ?? []
		};
	} catch (error) {
		console.error('Failed to parse autosave', error);
		return null;
	}
};

const loadInitialState = () => {
	if (!browser) return baseState();
	try {
		if (sessionStorage.getItem(FORCE_CLEAR_FLAG)) {
			sessionStorage.removeItem(FORCE_CLEAR_FLAG);
			localStorage.removeItem(AUTOSAVE_KEY);
			return baseState();
		}
	} catch (error) {
		console.warn('Unable to inspect sessionStorage for hard reload flag', error);
	}
	return safeParse(localStorage.getItem(AUTOSAVE_KEY)) ?? baseState();
};

const persist = (state: ComposerState) => {
	if (browser) {
		localStorage.setItem(
			AUTOSAVE_KEY,
			JSON.stringify({
				...state,
				notes: state.notes,
				motifs: state.motifs
			})
		);
	}
	return state;
};

const findNoteDefinition = (id: string): NoteDefinition | undefined =>
	NOTE_PALETTE.find((note) => note.id === id);

const touch = (state: ComposerState): ComposerState => ({ ...state, updatedAt: Date.now() });

export type PlacementActionResult = PlacementValidation & { noteId?: string };

export const createComposerStore = () => {
	const store = writable<ComposerState>(loadInitialState());

	const setAndPersist = (value: ComposerState) => store.set(persist(value));

	return {
		subscribe: store.subscribe,
		initializeSelection: (meter: MeterId, scaleId: ScaleId) => {
			const next = touch({
				...baseState(),
				meter,
				scaleId,
				tempo: DEFAULT_TEMPO
			});
			setAndPersist(next);
		},
		setMeter: (meter: MeterId) => {
			setAndPersist(
				touch({
					...get(store),
					meter,
					notes: []
				})
			);
		},
		setScale: (scaleId: ScaleId) => {
			setAndPersist(
				touch({
					...get(store),
					scaleId,
					notes: []
				})
			);
		},
		setTempo: (tempo: TempoId) => {
			setAndPersist(touch({ ...get(store), tempo }));
		},
		setBackgroundImage: (dataUrl?: string) => {
			setAndPersist(touch({ ...get(store), backgroundImage: dataUrl }));
		},
		setCompositionName: (name: string) => {
			setAndPersist(touch({ ...get(store), compositionName: name }));
		},
		clear: () => {
			const current = get(store);
			setAndPersist(touch({ ...current, notes: [] }));
		},
		placeNote: (definitionId: string, candidate: PlacementCandidate): PlacementActionResult => {
			const current = get(store);
			const definition = findNoteDefinition(definitionId);
			if (!definition) return { ok: false, reason: 'Unknown note' };
			if (definition.restrictTo && !definition.restrictTo.includes(current.meter)) {
				return { ok: false, reason: 'Not allowed in this meter' };
			}

			const validation = validatePlacement({
				meter: current.meter,
				notes: current.notes,
				candidate
			});

			if (!validation.ok) return validation;

			const rows = SCALES[current.scaleId].rows;
			const pitch = rows[candidate.rowIndex];
			if (!pitch) {
				return { ok: false, reason: 'Row unavailable in scale' };
			}

			const noteId = crypto.randomUUID();
			const newNote = {
				id: noteId,
				noteDefinitionId: definition.id,
				rowIndex: candidate.rowIndex,
				startTick: candidate.startTick,
				durationTicks: candidate.durationTicks,
				color: definition.color,
				pitch
			};

			setAndPersist(
				touch({
					...current,
					notes: [...current.notes, newNote]
				})
			);

			return { ok: true, noteId };
		},
		moveNote: (noteId: string, candidate: PlacementCandidate): PlacementActionResult => {
			const current = get(store);
			const note = current.notes.find((n) => n.id === noteId);
			if (!note) return { ok: false, reason: 'Missing note' };

			const validation = validatePlacement({
				meter: current.meter,
				notes: current.notes,
				candidate,
				ignoreNoteId: noteId
			});

			if (!validation.ok) return validation;

			const rows = SCALES[current.scaleId].rows;
			if (!rows[candidate.rowIndex]) {
				return { ok: false, reason: 'Row unavailable' };
			}

			const updatedNotes = current.notes.map((entry) =>
				entry.id === noteId
					? {
						...entry,
						rowIndex: candidate.rowIndex,
						startTick: candidate.startTick,
						durationTicks: candidate.durationTicks,
						pitch: rows[candidate.rowIndex]
					}
					: entry
			);

			setAndPersist(touch({ ...current, notes: updatedNotes }));
			return { ok: true, noteId };
		},
		removeNote: (noteId: string) => {
			const current = get(store);
			setAndPersist(
				touch({ ...current, notes: current.notes.filter((note) => note.id !== noteId) })
			);
		},
		createMotifFromNotes: (noteIds: string[], name: string): Motif | null => {
			const current = get(store);
			const selection = current.notes.filter((note) => noteIds.includes(note.id));
			if (!selection.length) return null;

			const minTick = Math.min(...selection.map((note) => note.startTick));
			const minRow = Math.min(...selection.map((note) => note.rowIndex));
			const maxTick = Math.max(...selection.map((note) => note.startTick + note.durationTicks));
			const maxRow = Math.max(...selection.map((note) => note.rowIndex));

			const motif: Motif = {
				id: crypto.randomUUID(),
				name,
				notes: selection.map((note) => ({
					noteDefinitionId: note.noteDefinitionId,
					rowOffset: note.rowIndex - minRow,
					startTickOffset: note.startTick - minTick,
					durationTicks: note.durationTicks
				})),
				widthTicks: maxTick - minTick,
				rowSpan: maxRow - minRow + 1
			};

			setAndPersist(touch({ ...current, motifs: [...current.motifs, motif] }));
			return motif;
		},
		placeMotif: (motifId: string, startTick: number, rowIndex: number): PlacementValidation => {
			const current = get(store);
			const motif = current.motifs.find((entry) => entry.id === motifId);
			if (!motif) return { ok: false, reason: 'Missing motif' };

			const targetRows = SCALES[current.scaleId].rows;
			if (rowIndex + motif.rowSpan > targetRows.length) {
				return { ok: false, reason: 'Motif exceeds scale range' };
			}

			for (const motifNote of motif.notes) {
				const candidate: PlacementCandidate = {
					rowIndex: rowIndex + motifNote.rowOffset,
					startTick: startTick + motifNote.startTickOffset,
					durationTicks: motifNote.durationTicks
				};
				const validation = validatePlacement({
					meter: current.meter,
					notes: current.notes,
					candidate
				});
				if (!validation.ok) return validation;
			}

			let working = [...current.notes];
			for (const motifNote of motif.notes) {
				const definition = findNoteDefinition(motifNote.noteDefinitionId);
				if (!definition) continue;
				const candidate: PlacementCandidate = {
					rowIndex: rowIndex + motifNote.rowOffset,
					startTick: startTick + motifNote.startTickOffset,
					durationTicks: motifNote.durationTicks
				};
				const pitch = targetRows[candidate.rowIndex];
				if (!pitch) continue;
				working = [
					...working,
					{
						id: crypto.randomUUID(),
						noteDefinitionId: definition.id,
						rowIndex: candidate.rowIndex,
						startTick: candidate.startTick,
						durationTicks: candidate.durationTicks,
						color: definition.color,
						pitch
					}
				];
			}

			setAndPersist(touch({ ...current, notes: working }));
			return { ok: true };
		},
		removeMotif: (motifId: string) => {
			const current = get(store);
			setAndPersist(touch({ ...current, motifs: current.motifs.filter((motif) => motif.id !== motifId) }));
		},
		importState: (payload: ComposerState) => {
			const meter = METERS[payload.meter] ? payload.meter : '4/4';
			const scaleId = SCALES[payload.scaleId] ? payload.scaleId : 'c-major';
			const tempo = TEMPOS.find((entry) => entry.id === payload.tempo) ? payload.tempo : DEFAULT_TEMPO;
			const sanitized: ComposerState = {
				...baseState(),
				...payload,
				meter,
				scaleId,
				tempo,
				notes: alignNotesWithScale(payload.notes ?? [], scaleId),
				motifs: payload.motifs ?? []
			};
			setAndPersist(touch(sanitized));
		},
		exportState: () => JSON.stringify(get(store), null, 2)
	};
};

export const composerStore = createComposerStore();
