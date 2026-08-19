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

interface Props {
	refreshTick?: number;
}

export function SharedObjects({ refreshTick }: Props) {
	const [shares, setShares] = useState<ShareRow[] | null>(null);
	const [revoking, setRevoking] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState(false);

	function load() {
		api.get<ShareRow[]>("/share").then(setShares).catch(() => setShares([]));
	}

	useEffect(load, [refreshTick]);

	async function handleRevoke(token: string) {
		setRevoking(token);
		try {
			await api.del(`/share/${token}`);
			setShares((prev) => prev?.filter((s) => s.token !== token) ?? []);
		} finally {
			setRevoking(null);
		}
	}

	if (!shares) return null;
	if (shares.length === 0) return null;

	return (
		<div className="card mb-md">
			<div
				className="card-header card-hoverable"
				style={{ cursor: "pointer" }}
				onClick={() => setCollapsed((c) => !c)}
			>
				<span className="card-title">📤 Shared Objects</span>
				<span className="badge badge-t3">{shares.length} active</span>
				<span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
					{collapsed ? "▼" : "▲"}
				</span>
			</div>

			{!collapsed && (
				<>
					{shares.map((s) => (
						<div
							key={s.token}
							className="settings-row"
							style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, paddingTop: 10, paddingBottom: 10 }}
						>
							<div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-start", gap: 8 }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>
										{TYPE_ICON[s.object_type] ?? "📎"} {s.label}
									</div>
									<div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
										{s.object_type.toUpperCase()} · expires {formatISTDate(s.expires_at)}
										<span
											style={{
												marginLeft: 6,
												color: timeLeft(s.expires_at) === "expired" ? "var(--danger)" :
													timeLeft(s.expires_at).startsWith("0") ? "var(--danger)" : "var(--muted)",
												fontWeight: 600,
											}}
										>
											({timeLeft(s.expires_at)} left)
										</span>
									</div>
								</div>
								<button
									className="btn btn-sm btn-danger"
									style={{ flexShrink: 0 }}
									disabled={revoking === s.token}
									onClick={() => handleRevoke(s.token)}
								>
									{revoking === s.token ? <span className="spinner" /> : "Expire now"}
								</button>
							</div>
						</div>
					))}
				</>
			)}
		</div>
	);
}
