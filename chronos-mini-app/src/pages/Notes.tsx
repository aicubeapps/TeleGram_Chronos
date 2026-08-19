import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { NoteRow } from "../types";
import { Modal } from "../components/Modal";

function daysRemaining(expiresAt: string): number {
	const d = new Date(`${expiresAt.replace(" ", "T")}Z`);
	const ms = d.getTime() - Date.now();
	return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function Notes() {
	const [notes, setNotes] = useState<NoteRow[] | null>(null);
	const [query, setQuery] = useState("");
	const [showAdd, setShowAdd] = useState(false);
	const [text, setText] = useState("");
	const [selfDestruct, setSelfDestruct] = useState(false);
	const [ttl, setTtl] = useState("3");

	function load() {
		api.get<NoteRow[]>("/notes").then(setNotes);
	}

	useEffect(load, []);

	async function handleAdd() {
		if (!text.trim()) return;
		await api.post("/notes", { text: text.trim(), ttlDays: selfDestruct ? parseInt(ttl, 10) : null });
		setShowAdd(false);
		setText("");
		setSelfDestruct(false);
		load();
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
								<button className="card-remove-btn" onClick={() => handleDelete(n.id)}>
									✕
								</button>
							</div>
							<p>{n.text}</p>
						</div>
					))}
				</div>
			)}

			{showAdd && (
				<Modal title="New Note" onClose={() => setShowAdd(false)}>
					<textarea className="input mb-md" rows={3} placeholder="Note text" value={text} onChange={(e) => setText(e.target.value)} />
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
						<label className="toggle">
							<input type="checkbox" checked={selfDestruct} onChange={(e) => setSelfDestruct(e.target.checked)} />
							<span className="toggle__track" />
						</label>
						<span className="bias-label">Self-destruct</span>
						{selfDestruct && (
							<select className="select-sm" value={ttl} onChange={(e) => setTtl(e.target.value)}>
								<option value="1">+1d</option>
								<option value="3">+3d</option>
								<option value="7">+7d</option>
							</select>
						)}
					</div>
					<button className="btn btn-primary btn-block" onClick={handleAdd}>
						Save
					</button>
				</Modal>
			)}
		</>
	);
}
