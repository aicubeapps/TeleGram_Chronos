import { toD1Utc, fromD1Utc, formatIST, IST_OFFSET_MIN, MONTH_NAMES, pad, parseTimeHHMM } from "./datetime";

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

type RuleParts =
	| { kind: "DAILY" }
	| { kind: "WEEKLY"; weekday: number } // 0=Sunday..6=Saturday
	| { kind: "MONTHLY"; dayOfMonth: number }
	| { kind: "YEARLY"; month: number; day: number }; // month 1-12

function parseRule(rule: string): RuleParts | null {
	if (rule === "DAILY") return { kind: "DAILY" };

	const weekly = /^WEEKLY:(\w+)$/.exec(rule);
	if (weekly) {
		const weekday = WEEKDAYS.indexOf(weekly[1]);
		if (weekday === -1) return null;
		return { kind: "WEEKLY", weekday };
	}

	const monthly = /^MONTHLY:(\d{1,2})$/.exec(rule);
	if (monthly) {
		const dayOfMonth = parseInt(monthly[1], 10);
		if (dayOfMonth < 1 || dayOfMonth > 31) return null;
		return { kind: "MONTHLY", dayOfMonth };
	}

	const yearly = /^YEARLY:(\d{2})-(\d{2})$/.exec(rule);
	if (yearly) {
		const month = parseInt(yearly[1], 10);
		const day = parseInt(yearly[2], 10);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return { kind: "YEARLY", month, day };
	}

	return null;
}

export function isValidRecurrenceRule(rule: string): boolean {
	return parseRule(rule) !== null;
}

// A Date whose UTC-getters/setters read/write IST wall-clock fields (real UTC instant + IST offset baked in).
function toIstShifted(utc: Date): Date {
	return new Date(utc.getTime() + IST_OFFSET_MIN * 60 * 1000);
}

function fromIstShifted(ist: Date): Date {
	return new Date(ist.getTime() - IST_OFFSET_MIN * 60 * 1000);
}

function lastDayOfMonth(year: number, month0: number): number {
	return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// Advances an IST-shifted calendar Date to the next date matching `parts`, strictly
// after `ist`, preserving `ist`'s own time-of-day.
function advanceIst(parts: RuleParts, ist: Date): Date {
	const H = ist.getUTCHours();
	const Mi = ist.getUTCMinutes();
	const S = ist.getUTCSeconds();

	if (parts.kind === "DAILY") {
		const next = new Date(ist.getTime());
		next.setUTCDate(next.getUTCDate() + 1);
		return next;
	}

	if (parts.kind === "WEEKLY") {
		const next = new Date(ist.getTime());
		do {
			next.setUTCDate(next.getUTCDate() + 1);
		} while (next.getUTCDay() !== parts.weekday);
		return next;
	}

	if (parts.kind === "MONTHLY") {
		let y = ist.getUTCFullYear();
		let m = ist.getUTCMonth() + 1;
		if (m > 11) {
			m = 0;
			y++;
		}
		const day = Math.min(parts.dayOfMonth, lastDayOfMonth(y, m));
		return new Date(Date.UTC(y, m, day, H, Mi, S));
	}

	// YEARLY
	const y = ist.getUTCFullYear() + 1;
	const day = Math.min(parts.day, lastDayOfMonth(y, parts.month - 1));
	return new Date(Date.UTC(y, parts.month - 1, day, H, Mi, S));
}

// Builds the IST-shifted candidate for "this period" (the occurrence containing/nearest
// to `istNow`, at `hour:minute` IST) without checking whether it's already past.
function periodCandidateIst(parts: RuleParts, istNow: Date, hour: number, minute: number): Date {
	const y = istNow.getUTCFullYear();
	const m = istNow.getUTCMonth();
	const d = istNow.getUTCDate();

	if (parts.kind === "DAILY") {
		return new Date(Date.UTC(y, m, d, hour, minute, 0));
	}

	if (parts.kind === "WEEKLY") {
		const todayDow = istNow.getUTCDay();
		const delta = (parts.weekday - todayDow + 7) % 7;
		return new Date(Date.UTC(y, m, d + delta, hour, minute, 0));
	}

	if (parts.kind === "MONTHLY") {
		const day = Math.min(parts.dayOfMonth, lastDayOfMonth(y, m));
		return new Date(Date.UTC(y, m, day, hour, minute, 0));
	}

	// YEARLY
	const day = Math.min(parts.day, lastDayOfMonth(y, parts.month - 1));
	return new Date(Date.UTC(y, parts.month - 1, day, hour, minute, 0));
}

/**
 * Advances a recurring reminder's next_fire by exactly one period, per the rule.
 * `fromDatetime` is a D1 UTC datetime string; the returned string carries the same
 * time-of-day (IST) as `fromDatetime`.
 */
export function calculateNextFire(rule: string, fromDatetime: string): string {
	const parts = parseRule(rule);
	if (!parts) throw new Error(`Unknown recurrence_rule: ${rule}`);

	const istFrom = toIstShifted(fromD1Utc(fromDatetime));
	const istNext = advanceIst(parts, istFrom);
	return toD1Utc(fromIstShifted(istNext));
}

/**
 * Computes the first future fire time (D1 UTC string) for a newly-created recurring
 * reminder, given the user's target hour/minute (IST) and the rule.
 */
export function firstFireAfter(rule: string, hour: number, minute: number, now: Date = new Date()): string {
	const parts = parseRule(rule);
	if (!parts) throw new Error(`Unknown recurrence_rule: ${rule}`);

	const istNow = toIstShifted(now);
	const istCandidate = periodCandidateIst(parts, istNow, hour, minute);
	const trueCandidate = fromIstShifted(istCandidate);

	if (trueCandidate.getTime() > now.getTime()) {
		return toD1Utc(trueCandidate);
	}
	return calculateNextFire(rule, toD1Utc(trueCandidate));
}

export function recurrenceCategoryWord(rule: string): string {
	const parts = parseRule(rule);
	if (!parts) return "Recurring";
	return capitalize(parts.kind.toLowerCase());
}

// Short phrase describing the pattern only (no time/next-fire), e.g. "every Monday".
export function recurrencePhraseShort(rule: string): string {
	const parts = parseRule(rule);
	if (!parts) return rule;

	switch (parts.kind) {
		case "DAILY":
			return "every day";
		case "WEEKLY":
			return `every ${capitalize(WEEKDAYS[parts.weekday])}`;
		case "MONTHLY":
			return `every month on day ${parts.dayOfMonth}`;
		case "YEARLY":
			return `yearly ${pad(parts.day)} ${MONTH_NAMES[parts.month - 1]}`;
	}
}

// Full /list detail line, e.g. "every Monday 09:00 IST (next: Mon 25 Aug)".
export function formatRecurrenceListLine(rule: string, nextFireD1Utc: string): string {
	const parts = parseRule(rule);
	if (!parts) return rule;

	const next = formatIST(nextFireD1Utc);

	if (parts.kind === "WEEKLY") {
		const nextIstDow = toIstShifted(fromD1Utc(nextFireD1Utc)).getUTCDay();
		return `every ${capitalize(WEEKDAYS[parts.weekday])} ${next.timeLabel} IST (next: ${WEEKDAY_ABBR[nextIstDow]} ${next.dateLabel})`;
	}
	if (parts.kind === "DAILY") {
		return `every day ${next.timeLabel} IST (next: ${next.dateLabel})`;
	}
	if (parts.kind === "MONTHLY") {
		return `every month on day ${parts.dayOfMonth} ${next.timeLabel} IST (next: ${next.dateLabel})`;
	}
	// YEARLY
	return `yearly ${pad(parts.day)} ${MONTH_NAMES[parts.month - 1]} (next: ${next.dateLabel} ${next.y})`;
}

export interface ParsedRecurringCommand {
	rule: string;
	hour: number;
	minute: number;
	message: string;
}

/**
 * Parses the tokens *after* "/remind" for the recurring syntaxes:
 *   every <weekday> HH:MM <message>
 *   every month <N> HH:MM <message>
 *   every day HH:MM <message>
 *   yearly <MM-DD> HH:MM <message>
 * Returns null if `tokens[0]` isn't "every"/"yearly", or if the syntax is malformed.
 */
export function parseRecurringCommand(tokens: string[]): ParsedRecurringCommand | null {
	const kw = (tokens[0] ?? "").toLowerCase();

	if (kw === "every") {
		const sub = (tokens[1] ?? "").toLowerCase();

		if (WEEKDAYS.includes(sub)) {
			const time = parseTimeHHMM(tokens[2] ?? "");
			if (!time) return null;
			const message = tokens.slice(3).join(" ");
			if (!message) return null;
			return { rule: `WEEKLY:${sub}`, hour: time.hour, minute: time.minute, message };
		}

		if (sub === "month") {
			const dayStr = tokens[2] ?? "";
			if (!/^\d{1,2}$/.test(dayStr)) return null;
			const day = parseInt(dayStr, 10);
			if (day < 1 || day > 31) return null;
			const time = parseTimeHHMM(tokens[3] ?? "");
			if (!time) return null;
			const message = tokens.slice(4).join(" ");
			if (!message) return null;
			return { rule: `MONTHLY:${day}`, hour: time.hour, minute: time.minute, message };
		}

		if (sub === "day") {
			const time = parseTimeHHMM(tokens[2] ?? "");
			if (!time) return null;
			const message = tokens.slice(3).join(" ");
			if (!message) return null;
			return { rule: "DAILY", hour: time.hour, minute: time.minute, message };
		}

		return null;
	}

	if (kw === "yearly") {
		const dateMatch = /^(\d{2})-(\d{2})$/.exec(tokens[1] ?? "");
		if (!dateMatch) return null;
		const mm = parseInt(dateMatch[1], 10);
		const dd = parseInt(dateMatch[2], 10);
		if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
		const time = parseTimeHHMM(tokens[2] ?? "");
		if (!time) return null;
		const message = tokens.slice(3).join(" ");
		if (!message) return null;
		return { rule: `YEARLY:${dateMatch[1]}-${dateMatch[2]}`, hour: time.hour, minute: time.minute, message };
	}

	return null;
}
