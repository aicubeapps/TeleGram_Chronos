import { getWebApp } from "./telegram";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://chronos-core-bot.aicube-apps.workers.dev";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const initData = getWebApp()?.initData ?? "";

	const isFormData = options.body instanceof FormData;

	const res = await fetch(`${API_BASE}/api${path}`, {
		...options,
		headers: {
			Authorization: initData,
			...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
			...options.headers,
		},
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`API ${options.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export const api = {
	get: <T>(path: string): Promise<T> => request<T>(path),
	post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
	patch: <T>(path: string, body?: unknown): Promise<T> =>
		request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
	del: <T>(path: string): Promise<T> => request<T>(path, { method: "DELETE" }),
	upload: <T>(path: string, formData: FormData): Promise<T> => request<T>(path, { method: "POST", body: formData }),
};

export { API_BASE };
