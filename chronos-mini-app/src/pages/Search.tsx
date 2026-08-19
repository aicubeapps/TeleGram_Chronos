import { useEffect, useState } from "react";
import { api, API_BASE } from "../api";
import { DocumentRow, ReminderRow, SearchResults } from "../types";
import { ReminderModal } from "../components/ReminderModal";
import { getWebApp } from "../telegram";

const IST_OFFSET_MS = 330 * 60 * 1000;

function formatISTDisplay(utcDatetime: string): string {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

export function Search() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults | null>(null);
	const [loading, setLoading] = useState(false);
	const [modalReminder, setModalReminder] = useState<ReminderRow | null>(null);
	const [retrieving, setRetrieving] = useState<number | null>(null);

	// BUG-09: debounced live search
	useEffect(() => {
		if (!query.trim() || query.length < 2) {
			setResults(null);
			return;
		}
		const timer = setTimeout(async () => {
			setLoading(true);
			try {
				const data = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
				setResults(data);
			} finally {
				setLoading(false);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [query]);

	async function handleRetrieve(doc: DocumentRow) {
		setRetrieving(doc.id);
		try {
			const initData = getWebApp()?.initData ?? "";
			const res = await fetch(`${API_BASE}/api/documents/${doc.id}`, {
				headers: { Authorization: initData },
			});
			if (!res.ok) throw new Error("Fetch failed");
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			if (doc.file_type === "photo") {
				window.open(url, "_blank");
			} else {
				const a = document.createElement("a");
				a.href = url;
				a.download = doc.label;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			}
			setTimeout(() => URL.revokeObjectURL(url), 5000);
		} finally {
			setRetrieving(null);
		}
	}

	const hasResults =
		results &&
		(results.reminders.length > 0 ||
			results.notes.length > 0 ||
			results.documents.length > 0 ||
			results.bookmarks.length > 0);

	return (
		<>
			<div className="page-title">Search</div>

			<div className="search-bar">
				<input
					className="search-input"
					placeholder="Search reminders, notes, vault, bookmarks..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					autoFocus
				/>
			</div>

			{/* Loading skeletons */}
			{loading && (
				<div>
					{[1, 2, 3].map((i) => (
						<div key={i} className="skeleton mb-sm" style={{ height: 60, borderRadius: "var(--radius-md)" }} />
					))}
				</div>
			)}

			{/* Empty state */}
			{results && !loading && !hasResults && (
				<div className="text-muted" style={{ textAlign: "center", padding: "var(--sp-lg)" }}>
					No results for "{query}"
				</div>
			)}

			{results && !loading && (
				<>
					{results.reminders.length > 0 && (
						<>
							<div className="section-heading">Reminders ({results.reminders.length})</div>
							{results.reminders.map((r) => (
								<div
									key={r.id}
									className="card card-hoverable mb-sm"
									onClick={() => setModalReminder(r)}
								>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
										<span className="badge badge-t1">⏰ REMINDER</span>
										<span className="text-muted" style={{ fontSize: 11 }}>
											{formatISTDisplay(r.snoozed_until ?? r.remind_on)}
										</span>
									</div>
									<p style={{ fontSize: 13 }}>{r.message}</p>
								</div>
							))}
						</>
					)}

					{results.notes.length > 0 && (
						<>
							<div className="section-heading">Notes ({results.notes.length})</div>
							{results.notes.map((n) => (
								<div key={n.id} className="card card-hoverable mb-sm">
									<div style={{ marginBottom: 4 }}>
										<span className="badge badge-nse">📝 NOTE</span>
										{n.expires_at && (
											<span className="badge badge-bear" style={{ marginLeft: 6 }}>
												💣 SELF-DESTRUCT
											</span>
										)}
									</div>
									<p style={{ fontSize: 13 }}>{n.text}</p>
								</div>
							))}
						</>
					)}

					{results.documents.length > 0 && (
						<>
							<div className="section-heading">Vault ({results.documents.length})</div>
							{results.documents.map((d) => (
								<div
									key={d.id}
									className="card card-hoverable mb-sm"
									onClick={() => retrieving !== d.id && handleRetrieve(d)}
									style={{ cursor: retrieving === d.id ? "wait" : "pointer" }}
								>
									<span className="badge">📎 VAULT</span>
									<p style={{ fontSize: 13, marginTop: 4 }}>
										{d.label}
										{retrieving === d.id && <span className="spinner" style={{ marginLeft: 8 }} />}
									</p>
								</div>
							))}
						</>
					)}

					{results.bookmarks.length > 0 && (
						<>
							<div className="section-heading">Bookmarks ({results.bookmarks.length})</div>
							{results.bookmarks.map((b) => (
								<div
									key={b.id}
									className="card card-hoverable mb-sm"
									onClick={() => window.open(b.url, "_blank")}
								>
									<span className="badge badge-bull">🔖 BOOKMARK</span>
									<p style={{ fontSize: 13, marginTop: 4 }}>{b.label}</p>
									<p className="text-muted" style={{ fontSize: 11 }}>{b.url}</p>
								</div>
							))}
						</>
					)}
				</>
			)}

			{modalReminder && (
				<ReminderModal
					reminder={modalReminder}
					onClose={() => setModalReminder(null)}
					onUpdate={() => setModalReminder(null)}
					onDelete={() => setModalReminder(null)}
				/>
			)}
		</>
	);
}
