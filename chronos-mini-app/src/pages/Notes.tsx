import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { NoteRow } from "../types";
import { Modal } from "../components/Modal";
import { ShareModal } from "../components/ShareModal";

function daysRemaining(expiresAt: string): number {
	const d = new Date(`${expiresAt.replace(" ", "T")}Z`);
	const ms = d.getTime() - Date.now();
	return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function calcExpiresAt(value: number, unit: string): string {
	const ms =
		unit === "hours"
			? value * 60 * 60 * 1000
			: unit === "weeks"
				? value * 7 * 24 * 60 * 60 * 1000
				: value * 24 * 60 * 60 * 1000; // days
	return new Date(Date.now() + ms).toISOString();
}

export function Notes() {
	const [notes, setNotes] = useState<NoteRow[] | null>(null);
	const [query, setQuery] = useState("");
	const [showAdd, setShowAdd] = useState(false);
	const [text, setText] = useState("");
	const [selfDestruct, setSelfDestruct] = useState(false);
	// BUG-06: number + unit TTL selector
	const [ttlValue, setTtlValue] = useState("2");
	const [ttlUnit, setTtlUnit] = useState("days");

	// BUG-05: save state
	const [saving, setSaving] = useState(false);
	const [showBanner, setShowBanner] = useState(false);
	const [showError, setShowError] = useState(false);
	const [shareNote, setShareNote] = useState<NoteRow | null>(null);

	function load() {
		api.get<NoteRow[]>("/notes").then(setNotes);
	}

	useEffect(load, []);

	// BUG-05: refresh after save, show banner, then close modal
	async function handleAdd() {
		if (!text.trim()) return;
		setSaving(true);
		setShowBanner(false);
		setShowError(false);

		let expires_at: string | null = null;
		if (selfDestruct) {
			const val = parseInt(ttlValue, 10);
			if (!isNaN(val) && val > 0) {
				expires_at = calcExpiresAt(val, ttlUnit);
			}
		}

		try {
			await api.post("/notes", { text: text.trim(), expires_at });
			await load(); // refresh list immediately
			setShowBanner(true);
			setTimeout(() => {
				setShowBanner(false);
				setShowAdd(false);
				setText("");
				setSelfDestruct(false);
				setTtlValue("2");
				setTtlUnit("days");
			}, 1500);
		} catch {
			setShowError(true);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: number) {
		await api.del(`/notes/${id}`);
		load();
	}

	const filtered = useMemo(() => {
		if (!notes) return [];
		if (!query.trim()) return notes;
		const q = query.toLowerCase();
		return notes.filter((n) => n.text.toLowerCase().includes(q));
	}, [notes, query]);

	if (!notes) {
		return <div className="skeleton" style={{ height: 200 }} />;
	}

	return (
		<>
			<div className="page-title">Notes</div>

			<input className="search-input mb-md" placeholder="Search notes..." value={query} onChange={(e) => setQuery(e.target.value)} />

			<button className="btn btn-primary mb-md" onClick={() => setShowAdd(true)}>
				+ Add Note
			</button>

			{filtered.length === 0 ? (
				<p className="text-muted">No notes saved</p>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
					{filtered.map((n) => (
						<div className="card" key={n.id}>
							<div className="card-header">
								<div className="card-title">📝 Note #{n.id}</div>
								{n.expires_at && <span className="badge badge-t1">💣 {daysRemaining(n.expires_at)}d left</span>}
								<button className="btn btn-sm btn-outline" style={{ marginLeft: "auto", marginRight: 4 }} onClick={() => setShareNote(n)}>
									📤
								</button>
								<button className="card-remove-btn" onClick={() => handleDelete(n.id)}>
									✕
								</button>
							</div>
							<p>{n.text}</p>
						</div>
					))}
				</div>
			)}

			{shareNote && (
				<ShareModal objectType="note" objectId={shareNote.id} onClose={() => setShareNote(null)} />
			)}

			{showAdd && (
				<Modal title="New Note" onClose={() => { setShowAdd(false); setShowBanner(false); setShowError(false); }}>
					<textarea className="input mb-md" rows={3} placeholder="Note text" value={text} onChange={(e) => setText(e.target.value)} />

					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
						<label className="toggle">
							<input type="checkbox" checked={selfDestruct} onChange={(e) => setSelfDestruct(e.target.checked)} />
							<span className="toggle__track" />
						</label>
						<span className="bias-label">Self-destruct</span>
					</div>

					{/* BUG-06: number + unit TTL selector */}
					{selfDestruct && (
						<>
							<label className="input-label">EXPIRES IN</label>
							<div style={{ display: "flex", gap: "var(--sp-sm)", marginBottom: 12 }}>
								<input
									className="input"
									type="number"
									min="1"
									placeholder="e.g. 2"
									style={{ width: 80 }}
									value={ttlValue}
									onChange={(e) => setTtlValue(e.target.value)}
								/>
								<select className="select-sm" value={ttlUnit} onChange={(e) => setTtlUnit(e.target.value)}>
									<option value="hours">Hours</option>
									<option value="days">Days</option>
									<option value="weeks">Weeks</option>
								</select>
							</div>
						</>
					)}

					{/* BUG-05: success/error banners */}
					{showBanner && (
						<div className="banner banner-success mb-md">✅ Note saved successfully</div>
					)}
					{showError && (
						<div className="banner banner-error mb-md">❌ Failed to save note. Try again.</div>
					)}

					<button className="btn btn-primary btn-block" onClick={handleAdd} disabled={saving}>
						{saving ? <span className="spinner" /> : "Save"}
					</button>
				</Modal>
			)}
		</>
	);
}
