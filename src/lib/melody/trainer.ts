export type MelodyTier = 1 | 2 | 3 | 4 | 5;

export type MelodyAttempt = {
	correct: boolean;
	timestamp: number;
	tier: MelodyTier;
};

export type MelodySessionStats = {
	date: string;
	tier: MelodyTier;
	totalAttempts: number;
	correctCount: number;
	streak: number;
	maxStreak: number;
	attempts: MelodyAttempt[];
};

export type MelodyTrainerState = {
	currentTier: MelodyTier;
	sessionStats: MelodySessionStats;
	lastTierChange: number;
	unlockedTiers: MelodyTier[];
};

export type TierConfig = {
	name: string;
	description: string;
	allowedDegrees: string[];
	phraseLengthMin: number;
	phraseLengthMax: number;
	maxLeap: number;
	resolutionProbability: number;
	startOnTonic: boolean;
};

const TIER_CONFIGS: Record<MelodyTier, TierConfig> = {
	1: {
		name: 'Diatonic Anchors',
		description: '1, 3, 5 — the core triad notes',
		allowedDegrees: ['1', '3', '5'],
		phraseLengthMin: 2,
		phraseLengthMax: 3,
		maxLeap: 1,
		resolutionProbability: 1.0,
		startOnTonic: true
	},
	2: {
		name: 'Full Major Scale',
		description: 'All diatonic degrees 1–7',
		allowedDegrees: ['1', '2', '3', '4', '5', '6', '7'],
		phraseLengthMin: 3,
		phraseLengthMax: 4,
		maxLeap: 2,
		resolutionProbability: 0.9,
		startOnTonic: true
	},
	3: {
		name: 'Chromatic Approach',
		description: 'Diatonic + chromatic neighbors',
		allowedDegrees: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
		phraseLengthMin: 3,
		phraseLengthMax: 4,
		maxLeap: 2,
		resolutionProbability: 0.7,
		startOnTonic: true
	},
	4: {
		name: 'Modal Mixture',
		description: 'Borrowed modes and chromaticism',
		allowedDegrees: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
		phraseLengthMin: 4,
		phraseLengthMax: 5,
		maxLeap: 3,
		resolutionProbability: 0.6,
		startOnTonic: false
	},
	5: {
		name: 'Free Melodic',
		description: 'All 12 chromatic notes',
		allowedDegrees: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
		phraseLengthMin: 5,
		phraseLengthMax: 6,
		maxLeap: 4,
		resolutionProbability: 0.5,
		startOnTonic: false
	}
};

const STORAGE_KEYS = {
	currentTier: 'tm:melody:trainer:currentTier',
	unlockedTiers: 'tm:melody:trainer:unlockedTiers',
	lastSession: 'tm:melody:trainer:lastSession',
	stats: (date: string) => `tm:melody:stats:${date}`
};

const ADVANCE_THRESHOLD = 0.8;
const DROP_THRESHOLD = 0.6;
const MIN_ATTEMPTS_FOR_ADVANCE = 15;
const MIN_ATTEMPTS_FOR_DROP = 8;

export class MelodyTrainerEngine {
	private state: MelodyTrainerState;
	private today: string;

	constructor() {
		this.today = this.getToday();
		this.state = this.loadState();
	}

	private getToday(): string {
		return new Date().toISOString().split('T')[0];
	}

	private loadState(): MelodyTrainerState {
		const savedTier = localStorage.getItem(STORAGE_KEYS.currentTier);
		const currentTier: MelodyTier = savedTier
			? (parseInt(savedTier, 10) as MelodyTier)
			: 1;

		const savedUnlocked = localStorage.getItem(STORAGE_KEYS.unlockedTiers);
		let unlockedTiers: MelodyTier[];
		if (savedUnlocked) {
			try {
				unlockedTiers = JSON.parse(savedUnlocked);
			} catch {
				unlockedTiers = this.computeUnlockedTiers(currentTier);
			}
		} else {
			unlockedTiers = this.computeUnlockedTiers(currentTier);
		}

		const lastSession = localStorage.getItem(STORAGE_KEYS.lastSession);
		let sessionStats: MelodySessionStats;

		if (lastSession === this.today) {
			const savedStats = localStorage.getItem(STORAGE_KEYS.stats(this.today));
			if (savedStats) {
				sessionStats = JSON.parse(savedStats);
			} else {
				sessionStats = this.createNewSession(currentTier);
			}
		} else {
			sessionStats = this.createNewSession(currentTier);
			localStorage.setItem(STORAGE_KEYS.lastSession, this.today);
		}

		return {
			currentTier,
			sessionStats,
			lastTierChange: Date.now(),
			unlockedTiers
		};
	}

	private computeUnlockedTiers(currentTier: MelodyTier): MelodyTier[] {
		const tiers: MelodyTier[] = [];
		for (let i = 1; i <= currentTier; i++) {
			tiers.push(i as MelodyTier);
		}
		return tiers;
	}

	private createNewSession(tier: MelodyTier): MelodySessionStats {
		return {
			date: this.today,
			tier,
			totalAttempts: 0,
			correctCount: 0,
			streak: 0,
			maxStreak: 0,
			attempts: []
		};
	}

	private saveState(): void {
		localStorage.setItem(STORAGE_KEYS.currentTier, String(this.state.currentTier));
		localStorage.setItem(STORAGE_KEYS.unlockedTiers, JSON.stringify(this.state.unlockedTiers));
		localStorage.setItem(STORAGE_KEYS.stats(this.today), JSON.stringify(this.state.sessionStats));
	}

	getCurrentTier(): MelodyTier {
		return this.state.currentTier;
	}

	getTierConfig(tier?: MelodyTier): TierConfig {
		return TIER_CONFIGS[tier ?? this.state.currentTier];
	}

	getTierName(tier?: MelodyTier): string {
		return this.getTierConfig(tier).name;
	}

	getTierDescription(tier?: MelodyTier): string {
		return this.getTierConfig(tier).description;
	}

	getUnlockedTiers(): MelodyTier[] {
		return [...this.state.unlockedTiers];
	}

	isTierUnlocked(tier: MelodyTier): boolean {
		return this.state.unlockedTiers.includes(tier);
	}

	getSessionStats(): MelodySessionStats {
		return { ...this.state.sessionStats };
	}

	getAccuracy(): number {
		const { totalAttempts, correctCount } = this.state.sessionStats;
		if (totalAttempts === 0) return 0;
		return Math.round((correctCount / totalAttempts) * 100);
	}

	getRecentAccuracy(count: number): number {
		const { attempts } = this.state.sessionStats;
		const recent = attempts.slice(-count);
		if (recent.length === 0) return 0;
		const correct = recent.filter((a) => a.correct).length;
		return Math.round((correct / recent.length) * 100);
	}

	getStreak(): number {
		return this.state.sessionStats.streak;
	}

	getMaxStreak(): number {
		return this.state.sessionStats.maxStreak;
	}

	recordAttempt(correct: boolean): void {
		const stats = this.state.sessionStats;

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

		stats.attempts.push({
			correct,
			timestamp: Date.now(),
			tier: this.state.currentTier
		});

		if (stats.attempts.length > 100) {
			stats.attempts = stats.attempts.slice(-100);
		}

		this.saveState();
	}

	checkTierChange(): { changed: boolean; newTier: MelodyTier; direction: 'up' | 'down' | null } {
		const stats = this.state.sessionStats;

		if (stats.totalAttempts >= MIN_ATTEMPTS_FOR_ADVANCE && this.state.currentTier < 5) {
			const recentAttempts = this.state.sessionStats.attempts.slice(-MIN_ATTEMPTS_FOR_ADVANCE);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy >= ADVANCE_THRESHOLD) {
				const newTier = (this.state.currentTier + 1) as MelodyTier;
				this.state.currentTier = newTier;
				this.state.lastTierChange = Date.now();
				if (!this.state.unlockedTiers.includes(newTier)) {
					this.state.unlockedTiers.push(newTier);
				}
				this.state.sessionStats = this.createNewSession(newTier);
				this.saveState();
				return { changed: true, newTier, direction: 'up' };
			}
		}

		if (stats.totalAttempts >= MIN_ATTEMPTS_FOR_DROP && this.state.currentTier > 1) {
			const recentAttempts = this.state.sessionStats.attempts.slice(-MIN_ATTEMPTS_FOR_DROP);
			const correctCount = recentAttempts.filter((a) => a.correct).length;
			const accuracy = correctCount / recentAttempts.length;

			if (accuracy < DROP_THRESHOLD) {
				const newTier = (this.state.currentTier - 1) as MelodyTier;
				this.state.currentTier = newTier;
				this.state.lastTierChange = Date.now();
				this.state.sessionStats = this.createNewSession(newTier);
				this.saveState();
				return { changed: true, newTier, direction: 'down' };
			}
		}

		return { changed: false, newTier: this.state.currentTier, direction: null };
	}

	setTier(tier: MelodyTier): void {
		if (!this.isTierUnlocked(tier)) return;
		this.state.currentTier = tier;
		this.state.sessionStats = this.createNewSession(tier);
		this.saveState();
	}

	resetSession(): void {
		this.state.sessionStats = this.createNewSession(this.state.currentTier);
		this.saveState();
	}

	resetProgress(): void {
		this.state.currentTier = 1;
		this.state.unlockedTiers = [1];
		this.state.sessionStats = this.createNewSession(1);
		this.saveState();
	}

	getPhraseLength(): number {
		const config = this.getTierConfig();
		return (
			Math.floor(
				Math.random() * (config.phraseLengthMax - config.phraseLengthMin + 1)
			) + config.phraseLengthMin
		);
	}
}

export { TIER_CONFIGS };