import {
	getTodayAndOverdueReminders,
	getUpcomingReminders,
	getRecurringActiveCount,
	getActiveListsSummary,
	getListRemindersDueToday,
	getNotesSummary,
	getDocumentsSummary,
	getBookmarksSummary,
} from "../db/dashboard";
import { ReminderRow } from "../db/reminders";
import { sendMessage } from "../telegram";
import { fromD1Utc, formatIST, IST_OFFSET_MIN } from "../utils/datetime";
import { toIST, formatISTDisplay } from "../utils/time";

const GENERIC_ERROR = "Something went wrong, try again";
const DIVIDER = "━━━━━━━━━━━━━━━━━━━";
const MAX_MESSAGE_LENGTH = 4096;

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatHeaderDate(now: Date = new Date()): string {
	const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
	return `${FULL_DAYS[ist.getUTCDay()]}, ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

function istTimeOnly(utcDatetime: string): string {
	const d = new Date(toIST(utcDatetime));
	return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function splitOverdueAndToday(rows: ReminderRow[]): { overdue: ReminderRow[]; today: ReminderRow[] } {
	const nowMs = Date.now();
	const overdue: ReminderRow[] = [];
	const today: ReminderRow[] = [];
	for (const r of rows) {
		const effective = r.snoozed_until ?? r.remind_on;
		if (fromD1Utc(effective).getTime() <= nowMs) {
			overdue.push(r);
		} else {
			today.push(r);
		}
	}
	return { overdue, today };
}

function buildRemindersSection(overdue: ReminderRow[], today: ReminderRow[], upcoming: ReminderRow[], recurringCount: number): string {
	const lines = [DIVIDER, "⏰ REMINDERS", DIVIDER];

	if (overdue.length === 0 && today.length === 0 && upcoming.length === 0) {
		lines.push("No reminders today ✅");
	} else {
		if (overdue.length > 0) {
			lines.push("🔴 Overdue:");
			for (const r of overdue) lines.push(`- ${r.message} — was ${formatISTDisplay(r.snoozed_until ?? r.remind_on)}`);
			lines.push("");
		}
		if (today.length > 0) {
			lines.push("📅 Today:");
			for (const r of today) lines.push(`- ${r.message} — ${istTimeOnly(r.snoozed_until ?? r.remind_on)}`);
			lines.push("");
		}
		if (upcoming.length > 0) {
			lines.push("🗓 Next 7 days:");
			for (const r of upcoming) lines.push(`- ${r.message} — ${formatISTDisplay(r.remind_on)}`);
			lines.push("");
		}
	}

	lines.push(`🔁 Recurring active: ${recurringCount}`);
	return lines.join("\n").trim();
}

function buildListsSection(
	lists: { name: string; total: number; pending: number }[],
	listReminders: (ReminderRow & { list_name: string })[],
): string {
	const lines = [DIVIDER, "✅ TO-DO LISTS", DIVIDER];

	if (lists.length === 0) {
		lines.push("No active lists");
	} else {
		for (const l of lists) {
			const suffix = l.total > 0 && l.pending === 0 ? " ✅" : "";
			lines.push(`- 📋 ${l.name} — ${l.pending} pending${suffix}`);
		}
	}

	if (listReminders.length > 0) {
		lines.push("", "🔔 List reminders today:");
		for (const r of listReminders) lines.push(`- ${r.message} — ${istTimeOnly(r.remind_on)}`);
	}

	return lines.join("\n").trim();
}

function buildNotesSection(total: number, expiringSoon: number): string {
	const lines = [DIVIDER, "📝 NOTES", DIVIDER];

	if (total === 0) {
		lines.push("No notes saved");
	} else {
		lines.push(`- ${total} active note${total === 1 ? "" : "s"}`);
		if (expiringSoon > 0) {
			lines.push(`- ⚠️ ${expiringSoon} expiring within 48hrs`);
		}
	}

	return lines.join("\n");
}

function buildVaultSection(
	docs: { total: number; last_saved: string | null },
	bookmarks: { total: number; last_saved: string | null },
): string {
	const lines = [DIVIDER, "📦 VAULT", DIVIDER];

	if (docs.total === 0 && bookmarks.total === 0) {
		lines.push("Vault empty");
	} else {
		if (docs.total > 0) {
			lines.push(`- 📎 ${docs.total} document${docs.total === 1 ? "" : "s"} — last saved ${formatIST(docs.last_saved as string).dateLabel}`);
		}
		if (bookmarks.total > 0) {
			lines.push(
				`- 🔖 ${bookmarks.total} bookmark${bookmarks.total === 1 ? "" : "s"} — last saved ${formatIST(bookmarks.last_saved as string).dateLabel}`,
			);
		}
	}

	return lines.join("\n");
}

export async function handleSummary(env: Env, chatId: number): Promise<void> {
	try {
		const chatIdStr = String(chatId);
		const [todayAndOverdue, upcoming, recurringCount, lists, listReminders, notes, docs, bookmarks] = await Promise.all([
			getTodayAndOverdueReminders(env.DB, chatIdStr),
			getUpcomingReminders(env.DB, chatIdStr),
			getRecurringActiveCount(env.DB, chatIdStr),
			getActiveListsSummary(env.DB, chatIdStr),
			getListRemindersDueToday(env.DB, chatIdStr),
			getNotesSummary(env.DB, chatIdStr),
			getDocumentsSummary(env.DB, chatIdStr),
			getBookmarksSummary(env.DB, chatIdStr),
		]);

		const { overdue, today } = splitOverdueAndToday(todayAndOverdue);

		const headerLines = [`🗓 ${formatHeaderDate()} — Your Summary`];
		if (overdue.length > 0) {
			headerLines.push(`⚠️ You have ${overdue.length} overdue reminder${overdue.length === 1 ? "" : "s"}`);
		}

		const remindersSection = buildRemindersSection(overdue, today, upcoming, recurringCount);
		const listsSection = buildListsSection(lists, listReminders);
		const notesSection = buildNotesSection(notes.total ?? 0, notes.expiring_soon ?? 0);
		const vaultSection = buildVaultSection(docs, bookmarks);
		const footer = `${DIVIDER}\nType /help for all commands`;

		const part1 = [headerLines.join("\n"), remindersSection, listsSection].join("\n\n");
		const part2 = [notesSection, vaultSection, footer].join("\n\n");
		const full = [part1, part2].join("\n\n");

		if (full.length <= MAX_MESSAGE_LENGTH) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, full);
		} else {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, part1);
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, part2);
		}
	} catch (err) {
		console.error("handleSummary: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
