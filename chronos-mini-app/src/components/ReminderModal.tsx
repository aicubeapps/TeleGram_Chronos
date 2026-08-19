import { useState } from "react";
import { api } from "../api";
import { ReminderRow } from "../types";
import { Modal } from "./Modal";

const SNOOZE_LABELS = ["15m", "30m", "1h", "2h", "4h", "24h"] as const;
const SNOOZE_MINUTES: Record<string, number> = {
	"15m": 15,
	"30m": 30,
	"1h": 60,
	"2h": 120,
	"4h": 240,
	"24h": 1440,
};

const IST_OFFSET_MS = 330 * 60 * 1000;

function istDateTimeParts(utcDatetime: string): { date: string; time: string } {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const date = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
	const time = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
	return { date, time };
}

function istInputToUtcIso(date: string, time: string): string {
	const [y, m, d] = date.split("-").map(Number);
	const [hh, mm] = time.split(":").map(Number);
	const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - IST_OFFSET_MS;
	return new Date(utcMs).toISOString();
}

const RECURRENCE_OPTIONS = [
	{ value: "DAILY", label: "Every Day" },
	{ value: "WEEKLY:monday", label: "Every Monday" },
	{ value: "WEEKLY:tuesday", label: "Every Tuesday" },
	{ value: "WEEKLY:wednesday", label: "Every Wednesday" },
	{ value: "WEEKLY:thursday", label: "Every Thursday" },
	{ value: "WEEKLY:friday", label: "Every Friday" },
	{ value: "WEEKLY:saturday", label: "Every Saturday" },
	{ value: "WEEKLY:sunday", label: "Every Sunday" },
	{ value: "MONTHLY:1", label: "Monthly (day 1)" },
	{ value: "MONTHLY:15", label: "Monthly (day 15)" },
	{ value: "MONTHLY:28", label: "Monthly (day 28)" },
];

interface Props {
	reminder: ReminderRow;
	onClose: () => void;
	onUpdate: (updated: ReminderRow) => void;
	onDelete: (id: number) => void;
}

export function ReminderModal({ reminder, onClose, onUpdate, onDelete }: Props) {
	const parts = istDateTimeParts(reminder.snoozed_until ?? reminder.remind_on);
	const [message, setMessage] = useState(reminder.message);
	const [date, setDate] = useState(parts.date);
	const [time, setTime] = useState(parts.time);
	const [recurrenceRule, setRecurrenceRule] = useState(reminder.recurrence_rule ?? "");
	const [saving, setSaving] = useState(false);
	const [pastTimeWarning, setPastTimeWarning] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");

	async function handleSnooze(label: string) {
		const minutes = SNOOZE_MINUTES[label];
		await api.patch(`/reminders/${reminder.id}/snooze`, { minutes });
		onUpdate({ ...reminder });
		onClose();
	}

	async function handleComplete() {
		await api.patch(`/reminders/${reminder.id}/complete`);
		onUpdate({ ...reminder, completed: 1 });
		onClose();
	}

	async function handleSave() {
		setSaving(true);
		setPastTimeWarning(false);
		setError("");
		const remind_on = istInputToUtcIso(date, time);
		const body: { message: string; remind_on: string; recurrence_rule?: string } = { message, remind_on };
		if (reminder.recurrence_rule) body.recurrence_rule = recurrenceRule;
		try {
			const data = await api.patch<{ warning?: string }>(`/reminders/${reminder.id}`, body);
			if (data?.warning === "past_time") {
				setPastTimeWarning(true);
			} else {
				onUpdate({ ...reminder, message, remind_on, recurrence_rule: recurrenceRule || null });
				onClose();
			}
		} catch {
			setError("Failed to save. Try again.");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		try {
			await api.del(`/reminders/${reminder.id}`);
			onDelete(reminder.id);
			onClose();
		} catch {
			setError("Failed to delete. Try again.");
			setDeleting(false);
		}
	}

	return (
		<Modal title="Reminder" onClose={onClose}>
			<label className="input-label">Message</label>
			<input className="input mb-md" value={message} onChange={(e) => setMessage(e.target.value)} />

			<label className="input-label">Date</label>
			<input className="input mb-md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

			<label className="input-label">Time (IST)</label>
			<input className="input mb-md" type="time" value={time} onChange={(e) => setTime(e.target.value)} />

			{reminder.recurrence_rule && (
				<>
					<label className="input-label">Recurrence</label>
					<select
						className="select-sm mb-md"
						value={recurrenceRule}
						onChange={(e) => setRecurrenceRule(e.target.value)}
					>
						{RECURRENCE_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</>
			)}

			<label className="input-label">Snooze</label>
			<div className="snooze-grid mb-md">
				{SNOOZE_LABELS.map((label) => (
					<button key={label} className="btn btn-outline btn-sm" onClick={() => handleSnooze(label)}>
						💤 {label}
					</button>
				))}
			</div>

			{pastTimeWarning && (
				<div className="banner banner-warning mb-md">⚠️ This time is in the past — reminder will fire on next cron poll</div>
			)}
			{error && <div className="banner banner-error mb-md">{error}</div>}

			{confirmDelete && (
				<div className="banner banner-warning mb-md" style={{ flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
					<span>Delete this reminder?</span>
					<div style={{ display: "flex", gap: 8 }}>
						<button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
							{deleting ? <span className="spinner" /> : "Yes, delete"}
						</button>
						<button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(false)}>
							Cancel
						</button>
					</div>
				</div>
			)}

			<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
				<button className="btn btn-success btn-sm" onClick={handleComplete}>
					✅ Done
				</button>
				{!confirmDelete && (
					<button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
						🗑️ Delete
					</button>
				)}
			</div>

			<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
				<button className="btn btn-outline btn-block" onClick={onClose}>
					Cancel
				</button>
				<button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>
					{saving ? <span className="spinner" /> : "Save Changes"}
				</button>
			</div>
		</Modal>
	);
}
