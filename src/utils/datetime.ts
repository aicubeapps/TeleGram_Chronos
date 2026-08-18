export const IST_OFFSET_MIN = 5 * 60 + 30;

const MONTH_ABBR: Record<string, number> = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	oct: 9,
	nov: 10,
	dec: 11,
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number, len = 2): string {
	return String(n).padStart(len, "0");
}

// Stored/compared as SQLite's own datetime('now') format ("YYYY-MM-DD HH:MM:SS", UTC,
// no "T"/"Z"/milliseconds) so the cron dispatcher's string comparison against
// datetime('now') stays correct.
export function toD1Utc(date: Date): string {
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
		date.getUTCHours(),
	)}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function fromD1Utc(value: string): Date {
	return new Date(value.replace(" ", "T") + "Z");
}

export interface IstYMD {
	y: number;
	m: number; // 0-indexed
	d: number;
}

export function istTodayYMD(now: Date = new Date()): IstYMD {
	const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
	return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
}

export interface IstFormatted extends IstYMD {
	dateLabel: string;
	timeLabel: string;
}

export function formatIST(d1UtcValue: string): IstFormatted {
	const utcMs = fromD1Utc(d1UtcValue).getTime();
	const ist = new Date(utcMs + IST_OFFSET_MIN * 60 * 1000);
	const y = ist.getUTCFullYear();
	const m = ist.getUTCMonth();
	const d = ist.getUTCDate();
	return {
		y,
		m,
		d,
		dateLabel: `${pad(d)} ${MONTH_NAMES[m]}`,
		timeLabel: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`,
	};
}

/**
 * Parses a /remind date + time argument pair (wall-clock IST) into the UTC
 * D1 datetime string, or null if either argument is malformed / not a real
 * calendar date.
 *
 * Accepted date formats: "+N" (N days from today, IST), "YYYY-MM-DD", "DD-MMM-YYYY".
 * Time format: "HH:MM" (24hr).
 */
export function parseReminderDateTime(dateStr: string, timeStr: string, now: Date = new Date()): string | null {
	const timeMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
	if (!timeMatch) return null;
	const hour = parseInt(timeMatch[1], 10);
	const minute = parseInt(timeMatch[2], 10);

	let year: number;
	let month: number; // 0-indexed
	let day: number;

	const relMatch = /^\+(\d+)$/.exec(dateStr);
	const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
	const dmyMatch = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(dateStr);

	if (relMatch) {
		const days = parseInt(relMatch[1], 10);
		const today = istTodayYMD(now);
		const base = new Date(Date.UTC(today.y, today.m, today.d));
		base.setUTCDate(base.getUTCDate() + days);
		year = base.getUTCFullYear();
		month = base.getUTCMonth();
		day = base.getUTCDate();
	} else if (isoMatch) {
		year = parseInt(isoMatch[1], 10);
		month = parseInt(isoMatch[2], 10) - 1;
		day = parseInt(isoMatch[3], 10);
	} else if (dmyMatch) {
		day = parseInt(dmyMatch[1], 10);
		const monKey = dmyMatch[2].toLowerCase();
		if (!(monKey in MONTH_ABBR)) return null;
		month = MONTH_ABBR[monKey];
		year = parseInt(dmyMatch[3], 10);
	} else {
		return null;
	}

	const wallClockUtcMs = Date.UTC(year, month, day, hour, minute, 0);
	const check = new Date(wallClockUtcMs);
	if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) {
		return null; // rejects overflowed calendar dates, e.g. 30-Feb
	}

	const realUtcMs = wallClockUtcMs - IST_OFFSET_MIN * 60 * 1000;
	return toD1Utc(new Date(realUtcMs));
}
