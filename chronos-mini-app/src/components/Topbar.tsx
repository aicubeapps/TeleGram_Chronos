import { TelegramWebAppUser } from "../telegram";

interface TopbarProps {
	onHamburger: () => void;
	user?: TelegramWebAppUser;
}

export function Topbar({ onHamburger, user }: TopbarProps) {
	return (
		<div className="topbar">
			<button className="hamburger" onClick={onHamburger} aria-label="Open menu">
				☰
			</button>
			<div className="topbar-brand">
				<h1>CHRONOS</h1>
				<p>PERSONAL ASSISTANT</p>
			</div>
			<div className="topbar-user">
				<span className="topbar-user-name">{user?.first_name}</span>
				<div className="user-avatar">{user?.first_name?.[0]}</div>
			</div>
		</div>
	);
}
