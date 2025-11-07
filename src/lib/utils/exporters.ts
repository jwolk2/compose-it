import jsPDF from 'jspdf';
import type { ComposerState } from '$lib/types/composer';
import { METERS } from '$lib/constants/music';
import { TICKS_PER_BEAT } from '$lib/types/composer';
import { downloadBlob } from './download';

const slugify = (value: string) =>
	(
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '') || 'compose-it'
	).slice(0, 48);

const pitchOffsets: Record<string, number> = {
	C: 0,
	'C#': 1,
	Db: 1,
	D: 2,
	'D#': 3,
	Eb: 3,
	E: 4,
	F: 5,
	'F#': 6,
	Gb: 6,
	G: 7,
	'G#': 8,
	Ab: 8,
	A: 9,
	'A#': 10,
	Bb: 10,
	B: 11
};

const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const referenceStep = 4 * 7 + letters.indexOf('E'); // E4 bottom line of treble staff

const pitchToMidi = (pitch: string) => {
	const match = pitch.match(/([A-G](?:#|b)?)(\d)/i);
	if (!match) return 60;
	const [, note, octave] = match;
	const semitone = pitchOffsets[note.toUpperCase()] ?? 0;
	return (parseInt(octave, 10) + 1) * 12 + semitone;
};

const pitchToStaffSteps = (pitch: string) => {
	const match = pitch.match(/([A-G])(?:#|b)?(\d)/i);
	if (!match) return 0;
	const [, letterRaw, octaveRaw] = match;
	const letter = letterRaw.toUpperCase();
	const octave = parseInt(octaveRaw, 10);
	const step = octave * 7 + letters.indexOf(letter);
	return step - referenceStep;
};

export const exportGridPdf = (imageDataUrl: string, state: ComposerState) => {
	const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
	pdf.setFont('helvetica', 'bold');
	pdf.setFontSize(22);
	pdf.text(state.compositionName || 'Compose-It', 40, 50);
	pdf.setFontSize(12);
	pdf.setFont('helvetica', 'normal');
	pdf.text(`Meter: ${state.meter} · Scale: ${state.scaleId} · Tempo: ${state.tempo}`, 40, 70);
	const pageWidth = pdf.internal.pageSize.getWidth() - 80;
	const pageHeight = pdf.internal.pageSize.getHeight() - 120;
	pdf.addImage(imageDataUrl, 'PNG', 40, 90, pageWidth, pageHeight, undefined, 'FAST');
	const blob = pdf.output('blob');
	downloadBlob(blob, `${slugify(state.compositionName)}-grid.pdf`);
};

export const exportNotationPdf = (state: ComposerState) => {
	const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
	const margin = 48;
	const lineGap = 12;
	const measuresPerRow = 2;
	const meter = METERS[state.meter];
	const measureTicks = meter.beatsPerMeasure * TICKS_PER_BEAT;
	pdf.setFont('helvetica', 'bold');
	pdf.setFontSize(20);
	pdf.text(`${state.compositionName || 'Compose-It'} — Treble Staff`, margin, 54);
	pdf.setFontSize(11);
	pdf.text(`Meter ${state.meter} • Tempo ${state.tempo}`, margin, 72);

	const usableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
	const measureWidth = usableWidth / measuresPerRow;

	const drawStaff = (originX: number, originY: number) => {
		for (let line = 0; line < 5; line += 1) {
			const y = originY + line * lineGap;
			pdf.line(originX, y, originX + measureWidth - 15, y);
		}
	};

	const drawLedgerLines = (x: number, steps: number, originY: number) => {
		const bottomLineY = originY + 4 * lineGap;
		const stepHeight = lineGap / 2;
		const ledgerThreshold = 4; // lines index from bottom line
		if (steps > ledgerThreshold) {
			for (let current = ledgerThreshold + 1; current <= steps; current += 2) {
				const y = bottomLineY - current * stepHeight;
				pdf.line(x - 10, y, x + 10, y);
			}
		} else if (steps < -ledgerThreshold) {
			for (let current = -ledgerThreshold - 1; current >= steps; current -= 2) {
				const y = bottomLineY - current * stepHeight;
				pdf.line(x - 10, y, x + 10, y);
			}
		}
	};

	for (let measure = 0; measure < meter.measures; measure += 1) {
		const rowIndex = Math.floor(measure / measuresPerRow);
		const colIndex = measure % measuresPerRow;
		const originX = margin + colIndex * measureWidth;
		const originY = 110 + rowIndex * (lineGap * 6 + 70);

		drawStaff(originX, originY);
		pdf.text(`M${measure + 1}`, originX, originY - 6);

		const measureNotes = state.notes.filter((note) => {
			const measureStart = measure * measureTicks;
			return note.startTick >= measureStart && note.startTick < measureStart + measureTicks;
		});

		measureNotes.forEach((note) => {
			const measureStart = measure * measureTicks;
			const localTick = note.startTick - measureStart;
			const x = originX + (localTick / measureTicks) * (measureWidth - 30) + 15;
			const durationRatio = note.durationTicks / measureTicks;
			const width = Math.max(10, durationRatio * (measureWidth - 30));
			const steps = pitchToStaffSteps(note.pitch);
			const stepHeight = lineGap / 2;
			const y = originY + 4 * lineGap - steps * stepHeight;
			drawLedgerLines(x, steps, originY);
			const midi = pitchToMidi(note.pitch);
			const filled = midi >= 72; // heuristically fill for eighth+ notes up high
			pdf.ellipse(x, y, width * 0.12, 6, filled ? 'F' : 'S');
			const stemUp = steps < 3;
			const stemHeight = 34;
			const stemX = stemUp ? x + width * 0.12 : x - width * 0.12;
			const stemY1 = y;
			const stemY2 = stemUp ? y - stemHeight : y + stemHeight;
			pdf.line(stemX, stemY1, stemX, stemY2);
		});
	}

	const blob = pdf.output('blob');
	downloadBlob(blob, `${slugify(state.compositionName)}-notation.pdf`);
};
