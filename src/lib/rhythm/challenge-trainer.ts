import {
	TrainerEngine,
	type DifficultyTier,
	type AttemptRecord,
	type SessionStats,
	type TrainerState
} from './trainer';

export type ChallengeMode = 'beat' | 'step';
export type ChallengeConfig = {
	meter: number;
	grouping: number[];
	floorsEnabled: boolean;
	floorSteps?: number;
	layerSteps?: number;
	mode: ChallengeMode;
};

export type ChallengeAttemptRecord = AttemptRecord & {
	config: ChallengeConfig;
	beatTarget?: number;
	stepTarget?: number;
};

export type ChallengeSessionStats = SessionStats & {
	config: ChallengeConfig;
	modeBreakdown: Record<ChallengeMode, { correct: number; total: number }>;
	meterBreakdown: Record<number, { correct: number; total: number }>;
	attempts: ChallengeAttemptRecord[];
};

export type ChallengeTrainerState = TrainerState & {
	sessionStats: ChallengeSessionStats;
};

const CHALLENGE_TIER_NAMES: Record<DifficultyTier, string> = {
	1: 'Simple Meters',
	2: 'Odd Meters',
	3: 'Complex Meters',
	4: 'Polyrhythms',
	5: 'Master Mix'
};

const CHALLENGE_TIER_DESCRIPTIONS: Record<DifficultyTier, string> = {
	1: 'Meters 2-4 with basic subdivisions',
	2: 'Meters 5-7 with standard groupings',
	3: 'Meters 6-8 with compound groupings',
	4: 'Floors mode: layer against floor',
	5: 'Any meter, any grouping, any mode'
};

// Tier to allowed meters mapping
const TIER_METERS: Record<DifficultyTier, number[]> = {
	1: [2, 3, 4],
	2: [5, 7],
	3: [6, 8],
	4: [2, 3, 4, 5, 6, 7, 8], // All meters but floors required
	5: [2, 3, 4, 5, 6, 7, 8] // All meters, floors optional
};

// Tier to floors requirement
const TIER_FLOORS_REQUIRED: Record<DifficultyTier, boolean> = {
	1: false,
	2: false,
	3: false,
	4: true,
	5: false // Optional at tier 5
};

const CHALLENGE_STORAGE_KEYS = {
	currentTier: 'tm:rhythm:challenge:currentTier',
	lastSession: 'tm:rhythm:challenge:lastSession',
	stats: (date: string) => `tm:rhythm:challenge:stats:${date}`
};

const CHALLENGE_ADVANCE_THRESHOLD = 0.85;
const CHALLENGE_DROP_THRESHOLD = 0.6;
const CHALLENGE_MIN_ATTEMPTS_FOR_ADVANCE = 15;
const CHALLENGE_MIN_ATTEMPTS_FOR_DROP = 8;

export class ChallengeTrainerEngine extends TrainerEngine {
	private challengeState: ChallengeTrainerState;
	private challengeToday: string;

	constructor() {
		super();
		this.challengeToday = this.getToday();
		this.challengeState = this.loadChallengeState();
	}

	private getToday(): string {
		return new Date().toISOString().split('T')[0];
	}

	private loadChallengeState(): ChallengeTrainerState {
		// Load current tier (persists across days)
		const savedTier = localStorage.getItem(CHALLENGE_STORAGE_KEYS.currentTier);
		const currentTier: DifficultyTier = savedTier
			? (parseInt(savedTier, 10) as DifficultyTier)
			: 1;

		// Check if we need to start a new session
		const lastSession = localStorage.getItem(CHALLENGE_STORAGE_KEYS.lastSession);
		let sessionStats: ChallengeSessionStats;

		if (lastSession === this.challengeToday) {
			// Continue today's session
			const savedStats = localStorage.getItem(CHALLENGE_STORAGE_KEYS.stats(this.challengeToday));
			if (savedStats) {
				sessionStats = JSON.parse(savedStats);
			} else {
				sessionStats = this.createNewChallengeSession(currentTier);
			}
		} else {
			// New day, new session
			sessionStats = this.createNewChallengeSession(currentTier);
			localStorage.setItem(CHALLENGE_STORAGE_KEYS.lastSession, this.challengeToday);
		}

		return {
			currentTier,
			sessionStats,
			lastTierChange: Date.now()
		};
	}

	private createNewChallengeSession(tier: DifficultyTier): ChallengeSessionStats {
		return {
			date: this.challengeToday,
			tier,
			totalAttempts: 0,
			correctCount: 0,
			streak: 0,
			maxStreak: 0,
			totalResponseTime: 0,
			subdivisionBreakdown: {},
			config: {
				meter: 4,
				grouping: [4],
				floorsEnabled: false,
				mode: 'beat'
			},
			modeBreakdown: {
				beat: { correct: 0, total: 0 },
				step: { correct: 0, total: 0 }
			},
			meterBreakdown: {},
			attempts: []
		};
	}

	private saveChallengeState(): void {
		localStorage.setItem(CHALLENGE_STORAGE_KEYS.currentTier, String(this.challengeState.currentTier));
		localStorage.setItem(
			CHALLENGE_STORAGE_KEYS.stats(this.challengeToday),
			JSON.stringify(this.challengeState.sessionStats)
		);
	}

	getCurrentTier(): DifficultyTier {
		return this.challengeState.currentTier;
	}

	getTierName(): string {
		return CHALLENGE_TIER_NAMES[this.challengeState.currentTier];
	}

	getTierDescription(): string {
		return CHALLENGE_TIER_DESCRIPTIONS[this.challengeState.currentTier];
	}

	getSessionStats(): ChallengeSessionStats {
		return { ...this.challengeState.sessionStats };
	}

	getAccuracy(): number {
		const { totalAttempts, correctCount } = this.challengeState.sessionStats;
		if (totalAttempts === 0) return 0;
		return Math.round((correctCount / totalAttempts) * 100);
	}

	getAverageResponseTime(): number {
		const { totalAttempts, totalResponseTime } = this.challengeState.sessionStats;
		if (totalAttempts === 0) return 0;
		return Math.round(totalResponseTime / totalAttempts);
	}

	getRecentAttempts(count: number): ChallengeAttemptRecord[] {
		const { attempts } = this.challengeState.sessionStats;
		return attempts.slice(-count);
	}

	// Get allowed meters for current tier
	getAllowedMeters(): number[] {
		return TIER_METERS[this.challengeState.currentTier];
	}

	// Check if floors is required for current tier
	isFloorsRequired(): boolean {
		return TIER_FLOORS_REQUIRED[this.challengeState.currentTier];
	}

	// Get target candidates based on config and tier
	getTargetCandidates(totalSteps: number, config: ChallengeConfig): number[] {
		const steps = Array.from({ length: totalSteps }, (_, i) => i);

		if (config.floorsEnabled && config.layerSteps) {
			// In floors mode, targets are layer positions
			const layerStride = totalSteps / config.layerSteps;
			return steps.filter((step) => step % layerStride === 0);
		}

		// Standard mode: use tier-based filtering
		switch (this.challengeState.currentTier) {
			case 1: // Simple meters - beat anchors only
				return steps.filter((step) => step % config.meter === 0);

			case 2: // Odd meters - simple subdivisions
				return steps.filter((step) => {
					const pos = step % config.meter;
					return pos === 0 || (config.meter % pos === 0 && pos !== 0);
				});

			case 3: // Complex meters - off-beats included
				return steps.filter((step) => {
					const pos = step % config.meter;
					return pos === 0 || pos === Math.floor(config.meter / 2);
				});

			case 4: // Polyrhythms - all layer positions
			case 5: // Master mix - all positions
			default:
				return steps;
		}
	}

	getNextTarget(totalSteps: number, config: ChallengeConfig): number {
		const candidates = this.getTargetCandidates(totalSteps, config);
		const randomIndex = Math.floor(Math.random() * candidates.length);
		return candidates[randomIndex];
	}

	recordAttempt(
		correct: boolean,
		responseTime: number,
		config: ChallengeConfig,
		targetStep: number,
		beatTarget?: number
	): void {
		const stats = this.challengeState.sessionStats;

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

		// Update mode breakdown
		if (!stats.modeBreakdown[config.mode]) {
			stats.modeBreakdown[config.mode] = { correct: 0, total: 0 };
		}
		stats.modeBreakdown[config.mode].total++;
		if (correct) {
			stats.modeBreakdown[config.mode].correct++;
		}

		// Update meter breakdown
		if (!stats.meterBreakdown[config.meter]) {
			stats.meterBreakdown[config.meter] = { correct: 0, total: 0 };
		}
		stats.meterBreakdown[config.meter].total++;
		if (correct) {
			stats.meterBreakdown[config.meter].correct++;
		}

		// Update subdivision breakdown
		if (!stats.subdivisionBreakdown[config.meter]) {
			stats.subdivisionBreakdown[config.meter] = { correct: 0, total: 0 };
		}
		stats.subdivisionBreakdown[config.meter].total++;
		if (correct) {
			stats.subdivisionBreakdown[config.meter].correct++;
		}

		// Record attempt
		stats.attempts.push({
			correct,
			responseTime,
			timestamp: Date.now(),
			subdivision: config.meter,
			targetStep,
			config: { ...config },
			beatTarget,
			stepTarget: targetStep
		});

		// Keep only last 50 attempts in memory
		if (stats.attempts.length > 50) {
			stats.attempts = stats.attempts.slice(-50);
		}

		// Update current config
		stats.config = { ...config };

		this.saveChallengeState();
	}

	checkTierChange(): { changed: boolean; newTier: DifficultyTier; direction: 'up' | 'down' | null } {
		const stats = this.challengeState.sessionStats;

		// Check for advancement
		if (stats.totalAttempts >= CHALLENGE_MIN_ATTEMPTS_FOR_ADVANCE && this.challengeState.currentTier < 5) {
			const recentAttempts = this.getRecentAttempts(CHALLENGE_MIN_ATTEMPTS_FOR_ADVANCE);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy >= CHALLENGE_ADVANCE_THRESHOLD) {
				const newTier = (this.challengeState.currentTier + 1) as DifficultyTier;
				this.challengeState.currentTier = newTier;
				this.challengeState.lastTierChange = Date.now();
				this.saveChallengeState();
				return { changed: true, newTier, direction: 'up' };
			}
		}

		// Check for demotion
		if (stats.totalAttempts >= CHALLENGE_MIN_ATTEMPTS_FOR_DROP && this.challengeState.currentTier > 1) {
			const recentAttempts = this.getRecentAttempts(CHALLENGE_MIN_ATTEMPTS_FOR_DROP);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy < CHALLENGE_DROP_THRESHOLD) {
				const newTier = (this.challengeState.currentTier - 1) as DifficultyTier;
				this.challengeState.currentTier = newTier;
				this.challengeState.lastTierChange = Date.now();
				this.saveChallengeState();
				return { changed: true, newTier, direction: 'down' };
			}
		}

		return { changed: false, newTier: this.challengeState.currentTier, direction: null };
	}

	resetSession(): void {
		this.challengeState.sessionStats = this.createNewChallengeSession(this.challengeState.currentTier);
		this.saveChallengeState();
	}

	resetProgress(): void {
		this.challengeState.currentTier = 1;
		this.challengeState.sessionStats = this.createNewChallengeSession(1);
		this.saveChallengeState();
	}

	// Get frequency for audio feedback based on tier
	getTargetFrequency(): number {
		switch (this.challengeState.currentTier) {
			case 1:
				return 180;
			case 2:
				return 450;
			case 3:
				return 900;
			case 4:
				return 1200;
			case 5:
				return 1500;
			default:
				return 900;
		}
	}
}

export { CHALLENGE_TIER_NAMES, CHALLENGE_TIER_DESCRIPTIONS };
