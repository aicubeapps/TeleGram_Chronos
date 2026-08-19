import { getReminder, updateReminder } from "../db/reminders";
import { fromD1Utc, toD1Utc, IST_OFFSET_MIN } from "../utils/datetime";
import { isValidRecurrenceRule, firstFireAfter } from "../utils/recurrence";

export interface EditReminderBody {
	message?: string;
	remind_on?: string;
	recurrence_rule?: string;
}

export interface EditReminderResult {
	status: number;
	body: unknown;
}

function istHourMinute(d1UtcValue: string): { hour: number; minute: number } {
	const ist = new Date(fromD1Utc(d1UtcValue).getTime() + IST_OFFSET_MIN * 60 * 1000);
	return { hour: ist.getUTCHours(), minute: ist.getUTCMinutes() };
}

export async function editReminder(env: Env, id: number, chatId: string, body: EditReminderBody): Promise<EditReminderResult> {
	const reminder = await getReminder(env.DB, id);
	if (!reminder || reminder.chat_id !== chatId) {
		return { status: 403, body: { error: "Forbidden" } };
	}

	if (body.recurrence_rule && !isValidRecurrenceRule(body.recurrence_rule)) {
		return { status: 400, body: { error: "Invalid recurrence_rule" } };
	}

	// The frontend sends an ISO 8601 UTC string (Date#toISOString()); normalize to the
	// D1 "YYYY-MM-DD HH:MM:SS" format used everywhere else so datetime('now') comparisons
	// elsewhere in the app (cron, dashboard, /list) keep working.
	let remindOn: string | undefined;
	let isPast = false;
	if (body.remind_on) {
		const parsed = new Date(body.remind_on);
		if (Number.isNaN(parsed.getTime())) {
			return { status: 400, body: { error: "Invalid remind_on" } };
		}
		remindOn = toD1Utc(parsed);
		isPast = parsed.getTime() < Date.now();
	}

	let nextFire: string | undefined;
	if (body.recurrence_rule) {
		const sourceDatetime = remindOn ?? reminder.next_fire ?? reminder.remind_on;
		const { hour, minute } = istHourMinute(sourceDatetime);
		nextFire = firstFireAfter(body.recurrence_rule, hour, minute);
	} else if (remindOn && reminder.recurrence_rule) {
		nextFire = remindOn;
	}

	await updateReminder(env.DB, id, chatId, {
		message: body.message,
		remindOn,
		recurrenceRule: body.recurrence_rule,
		nextFire,
	});

	const updated = await getReminder(env.DB, id);
	const warning = isPast ? "past_time" : undefined;

	return { status: 200, body: { reminder: updated, ...(warning ? { warning } : {}) } };
}
