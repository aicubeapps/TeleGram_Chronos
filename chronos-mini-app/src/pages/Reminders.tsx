import { useEffect, useState } from "react";
import { api } from "../api";
import { GroupedReminders, ReminderRow } from "../types";
import { Modal } from "../components/Modal";

type Filter = "all" | "today" | "upcoming" | "recurring";

const SNOOZE_OPTIONS = [
	{ label: "15m", minutes: 15 },
	{ label: "30m", minutes: 30 },
	{ label: "1hr", minutes: 60 },
	{ label: "2hr", minutes: 120 },
];

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

const IST_OFFSET_MS = 330 * 60 * 1000;

function istLabel(utcDatetime: string): string {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

function istDateTimeParts(utcDatetime: string): { date: string; time: string } {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const date = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
	const time = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
	return { date, time };
}

// Interprets editForm.date/time as IST wall-clock and returns the true UTC instant,
// independent of the browser's own local timezone (Date.UTC always treats its args as
// UTC components, so this can't double-apply an offset the way `new Date(isoLikeStr)`
// would if the device's local zone happened to already be IST).
function istInputToUtcIso(date: string, time: string): string {
	const [y, m, d] = date.split("-").map(Number);
	const [hh, mm] = time.split(":").map(Number);
	const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - IST_OFFSET_MS;
	return new Date(utcMs).toISOString();
}

interface EditForm {
	message: string;
	date: string;
	time: string;
	recurrence_rule: string;
}

export function Reminders() {
	const [grouped, setGrouped] = useState<GroupedReminders | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [showAdd, setShowAdd] = useState(false);
	const [date, setDate] = useState("");
	const [time, setTime] = useState("");
	const [message, setMessage] = useState("");
	const [recurring, setRecurring] = useState(false);

	const [editingReminder, setEditingReminder] = useState<ReminderRow | null>(null);
	const [editForm, setEditForm] = useState<EditForm>({ message: "", date: "", time: "", recurrence_rule: "" });
	const [saving, setSaving] = useState(false);
	const [pastTimeWarning, setPastTimeWarning] = useState(false);

	function load() {
		api.get<GroupedReminders>("/reminders").then(setGrouped);
	}

	useEffect(load, []);

	async function handleSnooze(id: number, minutes: number) {
		await api.patch(`/reminders/${id}/snooze`, { minutes });
		load();
	}

	async function handleComplete(id: number) {
		await api.patch(`/reminders/${id}/complete`);
		load();
	}

	async function handleAdd() {
		if (!date || !time || !message) return;
		await api.post("/reminders", { date, time, message, recurring });
		setShowAdd(false);
		setDate("");
		setTime("");
		setMessage("");
		setRecurring(false);
		load();
	}

	function openEditModal(reminder: ReminderRow) {
		const { date: d, time: t } = istDateTimeParts(reminder.snoozed_until ?? reminder.remind_on);
		setEditForm({ message: reminder.message, date: d, time: t, recurrence_rule: reminder.recurrence_rule ?? "" });
		setPastTimeWarning(false);
		setEditingReminder(reminder);
	}

	async function handleSaveEdit() {
		if (!editingReminder) return;
		setSaving(true);
		setPastTimeWarning(false);

		const remind_on = istInputToUtcIso(editForm.date, editForm.time);
		const body: { message: string; remind_on: string; recurrence_rule?: string } = {
			message: editForm.message,
			remind_on,
		};
		if (editingReminder.recurrence_rule) {
			body.recurrence_rule = editForm.recurrence_rule;
		}

		try {
			const data = await api.patch<{ warning?: string }>(`/reminders/${editingReminder.id}`, body);
			if (data.warning === "past_time") {
				setPastTimeWarning(true);
			} else {
				setEditingReminder(null);
			}
			load();
		} finally {
			setSaving(false);
		}
	}

	if (!grouped) {
		return <div className="skeleton" style={{ height: 200 }} />;
	}

	const rows: { row: ReminderRow; overdue: boolean }[] = [];
	if (filter === "all" || filter === "today") {
		grouped.overdue.forEach((r) => rows.push({ row: r, overdue: true }));
		grouped.today.forEach((r) => rows.push({ row: r, overdue: false }));
	}
	if (filter === "all" || filter === "upcoming") {
		grouped.upcoming.forEach((r) => rows.push({ row: r, overdue: false }));
	}
	if (filter === "all" || filter === "recurring") {
		grouped.recurring.forEach((r) => rows.push({ row: r, overdue: false }));
	}

	return (
		<>
			<div className="page-title">Reminders</div>

			<div className="filter-bar">
				<div className="filter-tabs">
					{(["all", "today", "upcoming", "recurring"] as Filter[]).map((f) => (
						<button key={f} className={`filter-tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
							{f.toUpperCase()}
						</button>
					))}
				</div>
				<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
					+ Add
				</button>
			</div>

			{rows.length === 0 ? (
				<p className="text-muted">No reminders in this view.</p>
			) : (
				<div className="table-wrap">
					<table className="alert-table">
						<tbody>
							{rows.map(({ row, overdue }) => (
								<tr key={row.id} style={overdue ? { borderLeft: "3px solid #ef4444" } : undefined}>
									<td className="asset-cell">{row.message}</td>
									<td className="ts-cell">
										{row.recurrence_rule ? row.recurrence_rule : istLabel(row.snoozed_until ?? row.remind_on)}
									</td>
									<td>
										<div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
											{SNOOZE_OPTIONS.map((opt) => (
												<button key={opt.minutes} className="btn btn-sm btn-outline" onClick={() => handleSnooze(row.id, opt.minutes)}>
													💤 {opt.label}
												</button>
											))}
											<button className="btn btn-sm btn-success" onClick={() => handleComplete(row.id)}>
												✅ Done
											</button>
											{row.completed !== 1 && (
												<button className="icon-btn" title="Edit" onClick={() => openEditModal(row)}>
													✏️
												</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{showAdd && (
				<Modal title="New Reminder" onClose={() => setShowAdd(false)}>
					<div className="input-label">Date</div>
					<input className="input mb-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
					<div className="input-label">Time</div>
					<input className="input mb-sm" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
					<div className="input-label">Message</div>
					<input className="input mb-sm" type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
					<label className="toggle">
						<input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
						<span className="toggle__track" />
					</label>
					<span className="bias-label" style={{ marginLeft: 8 }}>
						Recurring daily
					</span>
					<button className="btn btn-primary btn-block mt-md" onClick={handleAdd}>
						Save
					</button>
				</Modal>
			)}

			{editingReminder && (
				<Modal title="Edit Reminder" onClose={() => setEditingReminder(null)}>
					<label className="input-label">Message</label>
					<input
						className="input mb-md"
						value={editForm.message}
						onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
					/>

					<label className="input-label">Date</label>
					<input
						className="input mb-md"
						type="date"
						value={editForm.date}
						onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
					/>

					<label className="input-label">Time (IST)</label>
					<input
						className="input mb-md"
						type="time"
						value={editForm.time}
						onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
					/>

					{editingReminder.recurrence_rule && (
						<>
							<label className="input-label">Recurrence</label>
							<select
								className="select-sm mb-md"
								value={editForm.recurrence_rule}
								onChange={(e) => setEditForm({ ...editForm, recurrence_rule: e.target.value })}
							>
								{RECURRENCE_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</>
					)}

					{pastTimeWarning && (
						<div className="banner banner-warning mb-md">⚠️ This time is in the past — reminder will fire on next cron poll</div>
					)}

					<div style={{ display: "flex", gap: 8, marginTop: 16 }}>
						<button className="btn btn-outline btn-block" onClick={() => setEditingReminder(null)}>
							Cancel
						</button>
						<button className="btn btn-primary btn-block" onClick={handleSaveEdit} disabled={saving}>
							{saving ? <span className="spinner" /> : "Save Changes"}
						</button>
					</div>
				</Modal>
			)}
		</>
	);
}
