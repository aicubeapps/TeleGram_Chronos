import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "chronos-theme";

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(() => {
		return (localStorage.getItem(STORAGE_KEY) as Theme | null) || "light";
	});

	useEffect(() => {
		document.documentElement.className = `theme-${theme}`;
		localStorage.setItem(STORAGE_KEY, theme);
	}, [theme]);

	const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

	return { theme, setTheme, toggleTheme };
}
