import { useEffect, useState } from "react";
import { api } from "../api";

interface ShareRow {
	token: string;
	object_type: string;
	object_id: number;
	expires_at: string;
	label: string;
	url: string;
}

const IST_OFFSET_MS = 330 * 60 * 1000;

function formatISTDate(utcStr: string): string {
	const d = new Date(utcStr.replace(" ", "T") + (utcStr.includes("T") ? "" : "Z"));
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
}

function timeLeft(expiresAt: string): string {
	const d = new Date(expiresAt.replace(" ", "T") + (expiresAt.includes("T") ? "" : "Z"));
	const msLeft = d.getTime() - Date.now();
	if (msLeft <= 0) return "expired";
	const totalHours = Math.floor(msLeft / (60 * 60 * 1000));
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	if (days >= 1) return `${days}d ${hours}h`;
	if (totalHours >= 1) return `${totalHours}h`;
	const mins = Math.floor(msLeft / 60000);
	return `${mins}m`;
}

const TYPE_ICON: Record<string, string> = {
	note: "📝",
	list: "📋",
	document: "📄",
	bookmark: "🔖",
};

export function Shares() {
	const [shares, setShares] = useState<ShareRow[] | null>(null);
	const [revoking, setRevoking] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);

	function load() {
		api.get<ShareRow[]>("/share").then(setShares).catch(() => setShares([]));
	}

	useEffect(load, []);

	async function handleRevoke(token: string) {
		setRevoking(token);
		try {
			await api.del(`/share/${token}`);
			setShares((prev) => prev?.filter((s) => s.token !== token) ?? []);
		} finally {
			setRevoking(null);
		}
	}

	async function copyLink(url: string, token: string) {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(token);
			setTimeout(() => setCopied(null), 2000);
		} catch {
			// ignore
		}
	}

	return (
		<>
			<div className="page-title">Shared Objects</div>

			{!shares ? (
				<>
					<div className="skeleton mb-sm" style={{ height: 72, borderRadius: "var(--radius-md)" }} />
					<div className="skeleton mb-sm" style={{ height: 72, borderRadius: "var(--radius-md)" }} />
				</>
			) : shares.length === 0 ? (
				<p className="text-muted" style={{ textAlign: "center", padding: "var(--sp-lg)" }}>
					No active share links. Use the 📤 button on any note, list, document, or bookmark to create one.
				</p>
			) : (
				shares.map((s) => (
					<div className="card mb-sm" key={s.token}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word", marginBottom: 4 }}>
									{TYPE_ICON[s.object_type] ?? "📎"} {s.label}
								</div>
								<div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
									<span className="badge badge-t3" style={{ marginRight: 6 }}>
										{s.object_type.toUpperCase()}
									</span>
									Expires {formatISTDate(s.expires_at)}
									<span
										style={{
											marginLeft: 6,
											fontWeight: 700,
											color: timeLeft(s.expires_at) === "expired" || timeLeft(s.expires_at).endsWith("m")
												? "var(--danger)"
												: "var(--muted)",
										}}
									>
										({timeLeft(s.expires_at)} left)
									</span>
								</div>
							</div>
						</div>

						<div style={{ display: "flex", gap: 8 }}>
							<button
								className="btn btn-sm btn-outline"
								style={{ flex: 1 }}
								onClick={() => copyLink(s.url, s.token)}
							>
								{copied === s.token ? "✅ Copied!" : "📋 Copy Link"}
							</button>
							<button
								className="btn btn-sm btn-danger"
								style={{ flex: 1 }}
								disabled={revoking === s.token}
								onClick={() => handleRevoke(s.token)}
							>
								{revoking === s.token ? <span className="spinner" /> : "Expire now"}
							</button>
						</div>
					</div>
				))
			)}
		</>
	);
}
