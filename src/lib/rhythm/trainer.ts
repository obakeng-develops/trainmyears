export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

export type AttemptRecord = {
	correct: boolean;
	responseTime: number;
	timestamp: number;
	subdivision: number;
	targetStep: number;
};

export type SessionStats = {
	date: string;
	tier: DifficultyTier;
	totalAttempts: number;
	correctCount: number;
	streak: number;
	maxStreak: number;
	totalResponseTime: number;
	subdivisionBreakdown: Record<number, { correct: number; total: number }>;
	attempts: AttemptRecord[];
};

export type TrainerState = {
	currentTier: DifficultyTier;
	sessionStats: SessionStats;
	lastTierChange: number;
};

const TIER_NAMES: Record<DifficultyTier, string> = {
	1: 'Beat Anchors',
	2: 'Simple Subdivisions',
	3: 'Off-Beats',
	4: 'Complex Rhythms',
	5: 'Master Mix'
};

const TIER_DESCRIPTIONS: Record<DifficultyTier, string> = {
	1: 'Focus on the main beats',
	2: 'Even subdivisions within beats',
	3: 'The "and" of each beat',
	4: 'Triplets, quintuplets, and more',
	5: 'Any position, any subdivision'
};

const STORAGE_KEYS = {
	currentTier: 'tm:rhythm:trainer:currentTier',
	lastSession: 'tm:rhythm:trainer:lastSession',
	stats: (date: string) => `tm:rhythm:stats:${date}`
};

const ADVANCE_THRESHOLD = 0.85;
const DROP_THRESHOLD = 0.6;
const MIN_ATTEMPTS_FOR_ADVANCE = 10;
const MIN_ATTEMPTS_FOR_DROP = 5;

export class TrainerEngine {
	private state: TrainerState;
	private today: string;

	constructor() {
		this.today = this.getToday();
		this.state = this.loadState();
	}

	private getToday(): string {
		return new Date().toISOString().split('T')[0];
	}

	private loadState(): TrainerState {
		// Load current tier (persists across days)
		const savedTier = localStorage.getItem(STORAGE_KEYS.currentTier);
		const currentTier: DifficultyTier = savedTier
			? (parseInt(savedTier, 10) as DifficultyTier)
			: 1;

		// Check if we need to start a new session
		const lastSession = localStorage.getItem(STORAGE_KEYS.lastSession);
		let sessionStats: SessionStats;

		if (lastSession === this.today) {
			// Continue today's session
			const savedStats = localStorage.getItem(STORAGE_KEYS.stats(this.today));
			if (savedStats) {
				sessionStats = JSON.parse(savedStats);
			} else {
				sessionStats = this.createNewSession(currentTier);
			}
		} else {
			// New day, new session
			sessionStats = this.createNewSession(currentTier);
			localStorage.setItem(STORAGE_KEYS.lastSession, this.today);
		}

		return {
			currentTier,
			sessionStats,
			lastTierChange: Date.now()
		};
	}

	private createNewSession(tier: DifficultyTier): SessionStats {
		return {
			date: this.today,
			tier,
			totalAttempts: 0,
			correctCount: 0,
			streak: 0,
			maxStreak: 0,
			totalResponseTime: 0,
			subdivisionBreakdown: {},
			attempts: []
		};
	}

	private saveState(): void {
		localStorage.setItem(STORAGE_KEYS.currentTier, String(this.state.currentTier));
		localStorage.setItem(STORAGE_KEYS.stats(this.today), JSON.stringify(this.state.sessionStats));
	}

	getCurrentTier(): DifficultyTier {
		return this.state.currentTier;
	}

	getTierName(): string {
		return TIER_NAMES[this.state.currentTier];
	}

	getTierDescription(): string {
		return TIER_DESCRIPTIONS[this.state.currentTier];
	}

	getSessionStats(): SessionStats {
		return { ...this.state.sessionStats };
	}

	getAccuracy(): number {
		const { totalAttempts, correctCount } = this.state.sessionStats;
		if (totalAttempts === 0) return 0;
		return Math.round((correctCount / totalAttempts) * 100);
	}

	getAverageResponseTime(): number {
		const { totalAttempts, totalResponseTime } = this.state.sessionStats;
		if (totalAttempts === 0) return 0;
		return Math.round(totalResponseTime / totalAttempts);
	}

	getRecentAttempts(count: number): AttemptRecord[] {
		const { attempts } = this.state.sessionStats;
		return attempts.slice(-count);
	}

	getTargetCandidates(totalSteps: number, subdivisionCount: number): number[] {
		const steps = Array.from({ length: totalSteps }, (_, i) => i);

		switch (this.state.currentTier) {
			case 1: // Beat anchors only
				return steps.filter((step) => step % subdivisionCount === 0);

			case 2: // Simple subdivisions (divide evenly)
				return steps.filter((step) => {
					const pos = step % subdivisionCount;
					return pos === 0 || (subdivisionCount % pos === 0 && pos !== 0);
				});

			case 3: // Off-beats (middle of beat)
				return steps.filter((step) => {
					const pos = step % subdivisionCount;
					return pos === Math.floor(subdivisionCount / 2);
				});

			case 4: // Complex (non-anchor, non-off-beat)
				return steps.filter((step) => {
					const pos = step % subdivisionCount;
					const isAnchor = pos === 0;
					const isOffBeat = pos === Math.floor(subdivisionCount / 2);
					return !isAnchor && !isOffBeat;
				});

			case 5: // All positions
			default:
				return steps;
		}
	}

	getNextTarget(totalSteps: number, subdivisionCount: number): number {
		const candidates = this.getTargetCandidates(totalSteps, subdivisionCount);
		const randomIndex = Math.floor(Math.random() * candidates.length);
		return candidates[randomIndex];
	}

	recordAttempt(correct: boolean, responseTime: number, subdivisionCount: number, targetStep: number): void {
		const stats = this.state.sessionStats;

		// Update basic stats
		stats.totalAttempts++;
		if (correct) {
			stats.correctCount++;
			stats.streak++;
			if (stats.streak > stats.maxStreak) {
				stats.maxStreak = stats.streak;
			}
		} else {
			stats.streak = 0;
		}

		stats.totalResponseTime += responseTime;

		// Update subdivision breakdown
		if (!stats.subdivisionBreakdown[subdivisionCount]) {
			stats.subdivisionBreakdown[subdivisionCount] = { correct: 0, total: 0 };
		}
		stats.subdivisionBreakdown[subdivisionCount].total++;
		if (correct) {
			stats.subdivisionBreakdown[subdivisionCount].correct++;
		}

		// Record attempt
		stats.attempts.push({
			correct,
			responseTime,
			timestamp: Date.now(),
			subdivision: subdivisionCount,
			targetStep
		});

		// Keep only last 50 attempts in memory
		if (stats.attempts.length > 50) {
			stats.attempts = stats.attempts.slice(-50);
		}

		this.saveState();
	}

	checkTierChange(): { changed: boolean; newTier: DifficultyTier; direction: 'up' | 'down' | null } {
		const stats = this.state.sessionStats;

		// Check for advancement
		if (stats.totalAttempts >= MIN_ATTEMPTS_FOR_ADVANCE && this.state.currentTier < 5) {
			const recentAttempts = this.getRecentAttempts(MIN_ATTEMPTS_FOR_ADVANCE);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy >= ADVANCE_THRESHOLD) {
				const newTier = (this.state.currentTier + 1) as DifficultyTier;
				this.state.currentTier = newTier;
				this.state.lastTierChange = Date.now();
				this.saveState();
				return { changed: true, newTier, direction: 'up' };
			}
		}

		// Check for demotion
		if (stats.totalAttempts >= MIN_ATTEMPTS_FOR_DROP && this.state.currentTier > 1) {
			const recentAttempts = this.getRecentAttempts(MIN_ATTEMPTS_FOR_DROP);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy < DROP_THRESHOLD) {
				const newTier = (this.state.currentTier - 1) as DifficultyTier;
				this.state.currentTier = newTier;
				this.state.lastTierChange = Date.now();
				this.saveState();
				return { changed: true, newTier, direction: 'down' };
			}
		}

		return { changed: false, newTier: this.state.currentTier, direction: null };
	}

	resetSession(): void {
		this.state.sessionStats = this.createNewSession(this.state.currentTier);
		this.saveState();
	}

	resetProgress(): void {
		this.state.currentTier = 1;
		this.state.sessionStats = this.createNewSession(1);
		this.saveState();
	}

	// Get frequency for audio feedback based on tier
	getTargetFrequency(): number {
		switch (this.state.currentTier) {
			case 1:
				return 180; // Low thud - beat anchors
			case 2:
				return 450; // Low-mid - simple subdivisions
			case 3:
				return 900; // Mid - off-beats
			case 4:
				return 1200; // High - complex
			case 5:
				return 1500; // Very high - mixed/chaos
			default:
				return 900;
		}
	}
}

export { TIER_NAMES, TIER_DESCRIPTIONS };
