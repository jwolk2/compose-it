declare module 'soundfont-player' {
	interface NoteHandle {
		stop(when?: number): void;
	}

	interface InstrumentOptions {
		format?: 'mp3' | 'ogg';
		soundfont?: string;
		destination?: AudioNode;
		gain?: number;
		loop?: boolean;
	}

	interface PlayOptions {
		gain?: number;
		duration?: number;
	}

	interface InstrumentPlayer {
		play(note: string, when?: number, options?: PlayOptions): NoteHandle;
		stop(when?: number): void;
	}

	const Soundfont: {
		instrument(
			context: BaseAudioContext,
			name: string,
			options?: InstrumentOptions
		): Promise<InstrumentPlayer>;
	};

	export default Soundfont;
}
