import { useEffect, useState } from "react";
import { api } from "../api";
import { BookmarkRow } from "../types";
import { Modal } from "../components/Modal";

export function Bookmarks() {
	const [bookmarks, setBookmarks] = useState<BookmarkRow[] | null>(null);
	const [showAdd, setShowAdd] = useState(false);
	const [url, setUrl] = useState("");
	const [label, setLabel] = useState("");

	function load() {
		api.get<BookmarkRow[]>("/bookmarks").then(setBookmarks);
	}

	useEffect(load, []);

	async function handleAdd() {
		if (!url.trim()) return;
		await api.post("/bookmarks", { url: url.trim(), label: label.trim() });
		setShowAdd(false);
		setUrl("");
		setLabel("");
		load();
	}

	async function handleDelete(id: number) {
		await api.del(`/bookmarks/${id}`);
		load();
	}

	if (!bookmarks) {
		return <div className="skeleton" style={{ height: 200 }} />;
	}

	return (
		<>
			<div className="page-title">Bookmarks</div>

			<button className="btn btn-primary mb-md" onClick={() => setShowAdd(true)}>
				+ Add Bookmark
			</button>

			{bookmarks.length === 0 ? (
				<p className="text-muted">No bookmarks saved</p>
			) : (
				<div className="table-wrap">
					<table className="alert-table">
						<tbody>
							{bookmarks.map((b) => (
								<tr key={b.id}>
									<td className="asset-cell">
										<a href={b.url} target="_blank" rel="noreferrer">
											{b.label}
										</a>
									</td>
									<td>
										<button className="icon-btn" onClick={() => handleDelete(b.id)}>
											✕
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{showAdd && (
				<Modal title="New Bookmark" onClose={() => setShowAdd(false)}>
					<div className="input-label">URL</div>
					<input className="input mb-sm" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
					<div className="input-label">Label</div>
					<input className="input mb-md" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
					<button className="btn btn-primary btn-block" onClick={handleAdd}>
						Save
					</button>
				</Modal>
			)}
		</>
	);
}
