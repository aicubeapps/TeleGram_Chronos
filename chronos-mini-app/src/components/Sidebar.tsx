export type PageId = "dashboard" | "reminders" | "lists" | "notes" | "vault" | "bookmarks" | "shares" | "search" | "settings";

interface NavItem {
	id: string;
	icon: string;
	label: string;
	page: PageId;
}

const NAV_ITEMS: NavItem[] = [
	{ id: "nav-dash", icon: "📊", label: "DASHBOARD", page: "dashboard" },
	{ id: "nav-remind", icon: "⏰", label: "REMINDERS", page: "reminders" },
	{ id: "nav-lists", icon: "✅", label: "LISTS", page: "lists" },
	{ id: "nav-notes", icon: "📝", label: "NOTES", page: "notes" },
	{ id: "nav-vault", icon: "📎", label: "VAULT", page: "vault" },
	{ id: "nav-bookmarks", icon: "🔖", label: "BOOKMARKS", page: "bookmarks" },
	{ id: "nav-shares", icon: "📤", label: "SHARED", page: "shares" },
	{ id: "nav-search", icon: "🔍", label: "SEARCH", page: "search" },
];

interface SidebarProps {
	open: boolean;
	activePage: PageId;
	onNavigate: (page: PageId) => void;
}

export function Sidebar({ open, activePage, onNavigate }: SidebarProps) {
	return (
		<div className={`sidebar${open ? " sidebar-open" : ""}`}>
			<div style={{ height: 8 }} />
			<div className="sidebar-section">Menu</div>
			{NAV_ITEMS.map((item) => (
				<button
					key={item.id}
					id={item.id}
					className={`nav-item${activePage === item.page ? " active" : ""}`}
					onClick={() => onNavigate(item.page)}
				>
					<span className="ni-icon">{item.icon}</span>
					<span className="ni-label">{item.label}</span>
				</button>
			))}

			<div className="sidebar-section">Preferences</div>
			<button
				id="nav-settings"
				className={`nav-item${activePage === "settings" ? " active" : ""}`}
				onClick={() => onNavigate("settings")}
			>
				<span className="ni-icon">⚙️</span>
				<span className="ni-label">SETTINGS</span>
			</button>

			<div className="sidebar-footer">
				<p>
					CHRONOS v1.1
					<br />© 2026 AICUBEAPPS
				</p>
			</div>
		</div>
	);
}
