import { useEffect, useState } from "react";
import { api } from "../api";
import { ReminderRow, ListSummary } from "../types";
import { PageId } from "../components/Sidebar";
import { ReminderModal } from "../components/ReminderModal";

interface SummaryResponse {
	overdue: ReminderRow[];
	today: ReminderRow[];
	upcoming: ReminderRow[];
	recurringCount: number;
	lists: ListSummary[];
	listReminders: (ReminderRow & { list_name: string })[];
	notes: { total: number; expiring_soon: number };
	documents: { total: number; last_saved: string | null };
	bookmarks: { total: number; last_saved: string | null };
}

function istTime(utcDatetime: string): string {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + 330 * 60 * 1000);
	return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

function istDate(utcDatetime: string): string {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + 330 * 60 * 1000);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]}`;
}

interface DashboardProps {
	onNavigate: (page: PageId) => void;
	onNavigateToList?: (listId: number) => void;
}

export function Dashboard({ onNavigate, onNavigateToList }: DashboardProps) {
	const [data, setData] = useState<SummaryResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [modalReminder, setModalReminder] = useState<ReminderRow | null>(null);

	function load() {
		api
			.get<SummaryResponse>("/summary")
			.then(setData)
			.catch((err) => setError(String(err)));
	}

	useEffect(() => {
		load();
	}, []);

	if (error) {
		return <div className="banner banner-error">{error}</div>;
	}

	if (!data) {
		return (
			<>
				<div className="skeleton" style={{ height: 100, marginTop: 12, marginBottom: 16 }} />
				<div className="skeleton" style={{ height: 160, marginBottom: 16 }} />
				<div className="skeleton" style={{ height: 100 }} />
			</>
		);
	}

	const listReminderList = data.listReminders;
	const listCount = data.lists.length;

	const allReminders = [...data.overdue, ...data.today, ...data.upcoming];

	return (
		<>
			<div className="page-title" style={{ marginTop: 12 }}>
				Dashboard
			</div>

			{data.overdue.length > 0 && (
				<div className="banner banner-error">
					⚠️ You have {data.overdue.length} overdue reminder{data.overdue.length === 1 ? "" : "s"}
				</div>
			)}

			{/* BUG-10: Reminders card with clickable rows */}
			<div className="card">
				<div className="card-header">
					<div className="card-title">⏰ Reminders</div>
				</div>

				{allReminders.length === 0 ? (
					<p className="text-muted">No reminders today ✅</p>
				) : (
					<div>
						{data.overdue.map((r) => (
							<div
								key={`o-${r.id}`}
								className="card-hoverable"
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "8px 4px",
									borderLeft: "3px solid #ef4444",
									paddingLeft: 8,
									marginBottom: 4,
									borderRadius: "var(--radius-sm)",
								}}
								onClick={() => setModalReminder(r)}
							>
								<span style={{ fontSize: 13, fontWeight: 600 }}>{r.message}</span>
								<span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap", marginLeft: 8 }}>
									was {istDate(r.snoozed_until ?? r.remind_on)} {istTime(r.snoozed_until ?? r.remind_on)}
								</span>
							</div>
						))}
						{data.today.map((r) => (
							<div
								key={`t-${r.id}`}
								className="card-hoverable"
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "8px 4px",
									marginBottom: 4,
									borderRadius: "var(--radius-sm)",
								}}
								onClick={() => setModalReminder(r)}
							>
								<span style={{ fontSize: 13, fontWeight: 600 }}>{r.message}</span>
								<span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap", marginLeft: 8 }}>
									{istTime(r.snoozed_until ?? r.remind_on)}
								</span>
							</div>
						))}
						{data.upcoming.map((r) => (
							<div
								key={`u-${r.id}`}
								className="card-hoverable"
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "8px 4px",
									marginBottom: 4,
									borderRadius: "var(--radius-sm)",
								}}
								onClick={() => setModalReminder(r)}
							>
								<span style={{ fontSize: 13, fontWeight: 600 }}>{r.message}</span>
								<span className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap", marginLeft: 8 }}>
									{istDate(r.remind_on)} {istTime(r.remind_on)}
								</span>
							</div>
						))}
					</div>
				)}

				<p className="text-muted mt-sm">🔁 Recurring active: {data.recurringCount}</p>
			</div>

			{/* BUG-10: List cards with onClick to navigate + expand */}
			<div className="section-heading">To-Do Lists</div>
			{listCount === 0 ? (
				<p className="text-muted mb-md">No active lists</p>
			) : (
				data.lists.map((l) => {
					const donePct = l.total > 0 ? Math.round(((l.total - l.pending) / l.total) * 100) : 0;
					const colorClass = l.pending === 0 ? "ok" : l.pending / Math.max(l.total, 1) > 0.5 ? "danger" : "warning";
					return (
						<div
							className="card card-hoverable"
							key={l.id}
							onClick={() => {
								if (onNavigateToList) onNavigateToList(l.id);
								onNavigate("lists");
							}}
						>
							<div className="card-header">
								<div className="card-title">
									📋 {l.name} — {l.pending} pending
								</div>
							</div>
							<div className="progress-bar-wrap">
								<div className="progress-bar-bg">
									<div className={`progress-bar-fill ${colorClass}`} style={{ width: `${donePct}%` }} />
								</div>
								<div className="progress-bar-label">
									{l.total - l.pending} of {l.total} done
								</div>
							</div>
						</div>
					);
				})
			)}

			{listReminderList.length > 0 && (
				<div className="card">
					<div className="card-header">
						<div className="card-title">🔔 List reminders today</div>
					</div>
					{listReminderList.map((r) => (
						<div
							className="settings-row card-hoverable"
							key={r.id}
							onClick={() => setModalReminder(r)}
							style={{ cursor: "pointer" }}
						>
							<span className="settings-label">{istTime(r.remind_on)}</span>
							<span className="settings-value">{r.message}</span>
						</div>
					))}
				</div>
			)}

			{/* BUG-10: Notes card navigates to notes page */}
			<div className="section-heading">Notes</div>
			<div className="card card-hoverable" onClick={() => onNavigate("notes")}>
				<div className="settings-row">
					<span className="settings-label">Active</span>
					<span className="settings-value">{data.notes.total === 0 ? "No notes saved" : `${data.notes.total} notes`}</span>
				</div>
				{data.notes.expiring_soon > 0 && (
					<div className="settings-row">
						<span className="settings-label">⚠️ Expiring</span>
						<span className="settings-value">{data.notes.expiring_soon} within 48hrs</span>
					</div>
				)}
			</div>

			{/* BUG-10: Vault card navigates to vault page */}
			<div className="section-heading">Vault</div>
			<div className="card card-hoverable" onClick={() => onNavigate("vault")}>
				{data.documents.total === 0 && data.bookmarks.total === 0 ? (
					<p className="text-muted">Vault empty</p>
				) : (
					<>
						{data.documents.total > 0 && (
							<div className="settings-row">
								<span className="settings-label">📎 Documents</span>
								<span className="settings-value">
									{data.documents.total} — last saved {data.documents.last_saved ? istDate(data.documents.last_saved) : "—"}
								</span>
							</div>
						)}
						{data.bookmarks.total > 0 && (
							<div className="settings-row">
								<span className="settings-label">🔖 Bookmarks</span>
								<span className="settings-value">
									{data.bookmarks.total} — last saved {data.bookmarks.last_saved ? istDate(data.bookmarks.last_saved) : "—"}
								</span>
							</div>
						)}
					</>
				)}
			</div>

			<div className="filter-tabs mt-md">
				<button className="filter-tab" onClick={() => onNavigate("reminders")}>
					Reminders
				</button>
				<button className="filter-tab" onClick={() => onNavigate("lists")}>
					Lists
				</button>
				<button className="filter-tab" onClick={() => onNavigate("search")}>
					Search
				</button>
			</div>

			{/* BUG-10: ReminderModal for clicked reminder rows */}
			{modalReminder && (
				<ReminderModal
					reminder={modalReminder}
					onClose={() => setModalReminder(null)}
					onUpdate={() => { setModalReminder(null); load(); }}
					onDelete={() => { setModalReminder(null); load(); }}
				/>
			)}
		</>
	);
}
