import { useEffect, useState } from "react";
import { Topbar } from "./components/Topbar";
import { Sidebar, PageId } from "./components/Sidebar";
import { getWebApp, TelegramWebAppUser } from "./telegram";
import { useTheme } from "./hooks/useTheme";
import { Dashboard } from "./pages/Dashboard";
import { Reminders } from "./pages/Reminders";
import { Lists } from "./pages/Lists";
import { Notes } from "./pages/Notes";
import { Vault } from "./pages/Vault";
import { Bookmarks } from "./pages/Bookmarks";
import { Search } from "./pages/Search";
import { Shares } from "./pages/Shares";
import { Settings } from "./pages/Settings";

export default function App() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [page, setPage] = useState<PageId>("dashboard");
	const [user, setUser] = useState<TelegramWebAppUser | undefined>(undefined);
	const { theme, setTheme } = useTheme();
	const [expandedListId, setExpandedListId] = useState<number | null>(null);

	useEffect(() => {
		const webApp = getWebApp();
		webApp?.ready();
		webApp?.expand();
		setUser(webApp?.initDataUnsafe?.user);
	}, []);

	function navigateToList(listId: number) {
		setExpandedListId(listId);
		setPage("lists");
	}

	function renderPage() {
		switch (page) {
			case "dashboard":
				return <Dashboard onNavigate={setPage} onNavigateToList={navigateToList} />;
			case "reminders":
				return <Reminders />;
			case "lists":
				return <Lists expandedListId={expandedListId} />;
			case "notes":
				return <Notes />;
			case "vault":
				return <Vault />;
			case "bookmarks":
				return <Bookmarks />;
			case "shares":
				return <Shares />;
			case "search":
				return <Search />;
			case "settings":
				return <Settings user={user} theme={theme} setTheme={setTheme} />;
		}
	}

	return (
		<div className="app-shell">
			<Topbar onHamburger={() => setSidebarOpen(true)} user={user} />
			<div className="app-body">
				<Sidebar
					open={sidebarOpen}
					activePage={page}
					onNavigate={(p) => {
						setPage(p);
						setSidebarOpen(false);
					}}
				/>
				{sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
				<div className="content">
					<div className="shell">{renderPage()}</div>
				</div>
			</div>
		</div>
	);
}
