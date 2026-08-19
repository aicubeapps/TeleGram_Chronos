import { useState } from "react";
import { api } from "../api";
import { SearchResults } from "../types";

export function Search() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSearch() {
		if (!query.trim()) return;
		setLoading(true);
		try {
			const data = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
			setResults(data);
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<div className="page-title">Search</div>

			<div className="search-bar">
				<div className="search-input-wrap">
					<input
						className="search-input"
						placeholder="Search notes, documents, bookmarks..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					/>
					<button className="search-btn" onClick={handleSearch} disabled={loading}>
						{loading ? "..." : "Search"}
					</button>
				</div>
			</div>

			{results && (
				<>
					<div className="section-heading">Notes ({results.notes.length})</div>
					{results.notes.length === 0 ? (
						<p className="text-muted mb-md">No matches</p>
					) : (
						results.notes.map((n) => (
							<div className="card" key={n.id}>
								<p>{n.text}</p>
							</div>
						))
					)}

					<div className="section-heading">Documents ({results.documents.length})</div>
					{results.documents.length === 0 ? (
						<p className="text-muted mb-md">No matches</p>
					) : (
						results.documents.map((d) => (
							<div className="card" key={d.id}>
								<div className="card-title">{d.label}</div>
							</div>
						))
					)}

					<div className="section-heading">Bookmarks ({results.bookmarks.length})</div>
					{results.bookmarks.length === 0 ? (
						<p className="text-muted mb-md">No matches</p>
					) : (
						results.bookmarks.map((b) => (
							<div className="card" key={b.id}>
								<a href={b.url} target="_blank" rel="noreferrer">
									{b.label}
								</a>
							</div>
						))
					)}
				</>
			)}
		</>
	);
}
