import { TelegramWebAppUser } from "../telegram";
import { Theme } from "../hooks/useTheme";

interface SettingsProps {
	user?: TelegramWebAppUser;
	theme: Theme;
	setTheme: (theme: Theme) => void;
}

export function Settings({ user, theme, setTheme }: SettingsProps) {
	return (
		<>
			<div className="page-title">Settings</div>

			<div className="card">
				<div className="card-header">
					<span className="card-title">Appearance</span>
				</div>
				<div className="settings-row">
					<span className="settings-label">Theme</span>
					<div className="filter-tabs">
						<button className={`filter-tab${theme === "light" ? " active" : ""}`} onClick={() => setTheme("light")}>
							☀️ Light
						</button>
						<button className={`filter-tab${theme === "dark" ? " active" : ""}`} onClick={() => setTheme("dark")}>
							🌙 Dark
						</button>
					</div>
				</div>
			</div>

			<div className="card">
				<div className="card-header">
					<span className="card-title">Account</span>
				</div>
				<div className="settings-row">
					<span className="settings-label">Name</span>
					<span className="settings-value">
						{user?.first_name} {user?.last_name}
					</span>
				</div>
				<div className="settings-row">
					<span className="settings-label">Telegram ID</span>
					<span className="settings-value tabular-nums">{user?.id}</span>
				</div>
				<div className="settings-row">
					<span className="settings-label">Version</span>
					<span className="settings-value">CHRONOS v1.1</span>
				</div>
			</div>
		</>
	);
}
