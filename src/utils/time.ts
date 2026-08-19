import { fromD1Utc, IST_OFFSET_MIN } from "./datetime";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// D1 datetime strings have no "Z"/timezone suffix, so a raw `new Date(utcDatetime)` parse
// is engine-dependent. fromD1Utc() forces UTC parsing; this shifts that instant by +5:30.
export function toIST(utcDatetime: string): string {
	const d = fromD1Utc(utcDatetime);
	d.setUTCMinutes(d.getUTCMinutes() + IST_OFFSET_MIN);
	return d.toISOString();
}

// Returns "Mon 18 Aug 14:00".
export function formatISTDisplay(utcDatetime: string): string {
	const d = new Date(toIST(utcDatetime));
	return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
