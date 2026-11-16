import {
	CheckCircleIcon,
	PaperAirplaneIcon,
	PlusIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type {
	CodingAgentInfo,
	CodingSession,
	CodingSessionDetail,
	CodingSessionMessage,
} from "@/lib/api/clientCodingAgents";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { SettingRow, SettingSection } from "./rows";

const ENABLED_KEY = "otoyin.codingAgents.enabled";

function readEnabled(): string[] {
	try {
		return JSON.parse(localStorage.getItem(ENABLED_KEY) ?? "[]") as string[];
	} catch {
		return [];
	}
}

type StreamEvent =
	| {
			type: "update";
			update: {
				sessionUpdate: string;
				content?: { type: string; text?: string };
			};
	  }
	| { type: "done"; stop_reason: string }
	| { type: "error"; message: string };

/**
 * Connect local coding agents that speak ACP and drive them inside Otoyin.
 * Otoyin spawns the CLI invisibly as an ACP subprocess; every turn is saved
 * as a conversation so it appears alongside assistant history.
 */
export function CodingAgentsPage() {
	const { t } = useTranslation();
	const [agents, setAgents] = useState<CodingAgentInfo[]>([]);
	const [sessions, setSessions] = useState<CodingSession[]>([]);
	const [enabled, setEnabled] = useState<string[]>(readEnabled);
	const [selectedId, setSelectedId] = useState("");
	const [messages, setMessages] = useState<CodingSessionMessage[]>([]);
	const [agentId, setAgentId] = useState("");
	const [title, setTitle] = useState("");
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [customName, setCustomName] = useState("");
	const [customCommand, setCustomCommand] = useState("");
	const [refreshing, setRefreshing] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const [agentList, sessionList] = await Promise.all([
				apiClient.listCodingAgents(),
				apiClient.listCodingSessions(),
			]);
			setAgents(agentList.agents);
			setSessions(sessionList.sessions);
		} catch (e) {
			setError((e as Error).message);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!agentId && enabled.length > 0) {
			setAgentId(enabled[0] ?? "");
		}
	}, [enabled, agentId]);

	const toggleAgent = (id: string) => {
		const next = enabled.includes(id)
			? enabled.filter((value) => value !== id)
			: [...enabled, id];
		setEnabled(next);
		localStorage.setItem(ENABLED_KEY, JSON.stringify(next));
		if (next.length === 0) {
			setAgentId("");
		}
	};

	const newSession = async () => {
		if (!agentId) {
			return;
		}
		setBusy(true);
		setError("");
		try {
			const session = await apiClient.createCodingSession({
				agent_id: agentId,
				title: title.trim() || t("settings.codingAgents.untitled"),
			});
			setSessions((current) => [session, ...current]);
			setSelectedId(session.id);
			setMessages([]);
			setTitle("");
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const selectSession = async (id: string) => {
		setSelectedId(id);
		setError("");
		try {
			const detail: CodingSessionDetail = await apiClient.getCodingSession(id);
			setMessages(detail.messages);
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const send = async () => {
		const text = draft.trim();
		const sessionId = selectedId;
		if (!text || !sessionId || busy) {
			return;
		}
		setDraft("");
		setBusy(true);
		setError("");
		const userMessage: CodingSessionMessage = {
			id: `local-${Date.now()}`,
			role: "user",
			content: text,
			created_at: new Date().toISOString(),
		};
		const replyId = `local-${Date.now() + 1}`;
		setMessages((current) => [
			...current,
			userMessage,
			{
				id: replyId,
				role: "assistant",
				content: "",
				created_at: new Date().toISOString(),
			},
		]);

		try {
			const response = await fetch(
				`${apiClient.getBaseUrl()}/coding-agents/sessions/${sessionId}/prompt`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text }),
				},
			);
			if (!response.ok || !response.body) {
				throw new Error(
					(await response.json().catch(() => ({}))).detail ??
						response.statusText,
				);
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const blocks = buffer.split("\n\n");
				buffer = blocks.pop() ?? "";
				for (const block of blocks) {
					const line = block
						.split("\n")
						.find((part) => part.startsWith("data: "));
					if (!line) {
						continue;
					}
					const event = JSON.parse(line.slice(6)) as StreamEvent;
					if (
						event.type === "update" &&
						event.update.sessionUpdate === "agent_message_chunk"
					) {
						const chunk = event.update.content?.text ?? "";
						setMessages((current) =>
							current.map((message) =>
								message.id === replyId
									? { ...message, content: message.content + chunk }
									: message,
							),
						);
					} else if (event.type === "error") {
						setError(event.message);
					}
				}
			}
			await selectSession(sessionId);
			void refresh();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const cancel = async () => {
		if (!selectedId) {
			return;
		}
		try {
			await apiClient.cancelCodingSession(selectedId);
			void refresh();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const remove = async () => {
		if (!selectedId) {
			return;
		}
		try {
			await apiClient.deleteCodingSession(selectedId);
			setSelectedId("");
			setMessages([]);
			void refresh();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	const selectable = agents.filter(
		(agent) => enabled.includes(agent.id) && agent.acp_available,
	);
	const visibleAgents = agents.filter((agent) => {
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return true;
		}
		return `${agent.title} ${agent.description ?? ""}`
			.toLowerCase()
			.includes(needle);
	});

	const refreshRegistry = async () => {
		setRefreshing(true);
		setError("");
		try {
			await apiClient.refreshAgentRegistry();
			await refresh();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setRefreshing(false);
		}
	};

	const addCustom = async () => {
		const parts = customCommand.trim().split(/\s+/).filter(Boolean);
		if (!customName.trim() || parts.length === 0) {
			return;
		}
		setBusy(true);
		setError("");
		try {
			await apiClient.addCustomCodingAgent(customName.trim(), parts);
			setCustomName("");
			setCustomCommand("");
			await refresh();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const removeCustom = async (id: string) => {
		try {
			await apiClient.deleteCustomCodingAgent(id);
			await refresh();
		} catch (e) {
			setError((e as Error).message);
		}
	};

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">
					{t("settings.codingAgents.title")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("settings.codingAgents.description")}
				</p>
			</div>

			<SettingSection
				title={t("settings.codingAgents.connect")}
				description={t("settings.codingAgents.connectDescription")}
			>
				<div className="flex flex-wrap items-end gap-2 py-3">
					<Field label={t("settings.codingAgents.search")}>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("settings.codingAgents.searchPlaceholder")}
						/>
					</Field>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void refreshRegistry()}
						disabled={refreshing}
						title={t("settings.codingAgents.refreshHint")}
					>
						{t("settings.codingAgents.refresh")}
					</Button>
					<span className="pb-2 text-xs text-muted-foreground">
						{t("settings.codingAgents.registryCount", {
							installed: agents.filter((agent) => agent.installed).length,
							total: agents.length,
						})}
					</span>
				</div>
				{visibleAgents.map((agent) => {
					const isConnected = enabled.includes(agent.id);
					return (
						<SettingRow
							key={agent.id}
							title={agent.title}
							description={
								agent.installed
									? `${t(
											agent.acp_kind === "native"
												? "settings.codingAgents.native"
												: "settings.codingAgents.adapter",
										)} · ${agent.distribution}${agent.description ? ` · ${agent.description}` : ""}`
									: agent.install_hint
							}
							action={
								<div className="flex items-center gap-2">
									{isConnected ? (
										<span className="flex items-center gap-1 text-xs text-emerald-500">
											<CheckCircleIcon className="size-4" />
											{t("settings.codingAgents.connected")}
										</span>
									) : null}
									<Button
										size="sm"
										variant={isConnected ? "outline" : "default"}
										disabled={!agent.acp_available}
										onClick={() => toggleAgent(agent.id)}
										title={agent.install_hint}
									>
										{isConnected
											? t("settings.codingAgents.disconnect")
											: t("settings.codingAgents.connectAction")}
									</Button>
									{agent.source === "custom" ? (
										<Button
											size="sm"
											variant="ghost"
											onClick={() => void removeCustom(agent.id)}
											title={t("settings.codingAgents.deleteCustom")}
										>
											<TrashIcon className="size-4" />
										</Button>
									) : null}
								</div>
							}
						/>
					);
				})}
			</SettingSection>

			<SettingSection
				title={t("settings.codingAgents.customTitle")}
				description={t("settings.codingAgents.customDescription")}
			>
				<div className="flex flex-wrap items-end gap-2 py-3">
					<Field label={t("settings.codingAgents.customName")}>
						<Input
							value={customName}
							onChange={(event) => setCustomName(event.target.value)}
							placeholder="My agent"
						/>
					</Field>
					<Field label={t("settings.codingAgents.customCommand")}>
						<Input
							value={customCommand}
							onChange={(event) => setCustomCommand(event.target.value)}
							placeholder="my-agent acp"
						/>
					</Field>
					<Button
						size="sm"
						onClick={() => void addCustom()}
						disabled={busy || !customName.trim() || !customCommand.trim()}
						title={t("settings.codingAgents.customAdd")}
					>
						<PlusIcon className="size-4" />
						{t("settings.codingAgents.customAdd")}
					</Button>
				</div>
			</SettingSection>

			<SettingSection title={t("settings.codingAgents.newSession")}>
				<div className="divide-y divide-border">
					<div className="flex flex-wrap items-end gap-3 py-3">
						<Field label={t("settings.codingAgents.agent")}>
							<Select value={agentId} onValueChange={setAgentId}>
								<SelectTrigger className="w-56">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{selectable.map((agent) => (
										<SelectItem key={agent.id} value={agent.id}>
											{agent.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field label={t("settings.codingAgents.sessionTitle")}>
							<Input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder={t("settings.codingAgents.untitled")}
							/>
						</Field>
						<Button
							onClick={() => void newSession()}
							disabled={!agentId || busy}
							title={t("settings.codingAgents.start")}
						>
							<PlusIcon className="size-4" />
							{t("settings.codingAgents.start")}
						</Button>
					</div>
				</div>
			</SettingSection>

			<div className="grid max-w-6xl gap-4 lg:grid-cols-[260px_1fr]">
				<SettingSection title={t("settings.codingAgents.history")}>
					<div className="divide-y divide-border">
						{sessions.length === 0 ? (
							<p className="py-3 text-sm text-muted-foreground">
								{t("settings.codingAgents.noSessions")}
							</p>
						) : (
							sessions.map((session) => (
								<button
									key={session.id}
									type="button"
									onClick={() => void selectSession(session.id)}
									className={`w-full py-2 text-left text-sm hover:bg-muted/50 ${
										session.id === selectedId
											? "font-medium text-foreground"
											: "text-muted-foreground"
									}`}
								>
									<span className="block truncate">{session.title}</span>
									<span className="block text-xs opacity-70">
										{session.agent_id} ·{" "}
										{t(`settings.codingAgents.status.${session.status}`)} ·{" "}
										{session.updated_at ? formatDate(session.updated_at) : ""}
									</span>
								</button>
							))
						)}
					</div>
				</SettingSection>

				<section className="flex min-h-72 flex-col rounded-lg border border-border">
					{selectedId ? (
						<>
							<div className="flex items-center justify-between border-b border-border px-3 py-2">
								<span className="text-sm font-medium">
									{sessions.find((session) => session.id === selectedId)?.title}
								</span>
								<div className="flex gap-1">
									<Button
										size="sm"
										variant="ghost"
										title={t("settings.codingAgents.cancel")}
										disabled={!busy}
										onClick={() => void cancel()}
									>
										<StopIcon className="size-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										title={t("settings.codingAgents.delete")}
										onClick={() => void remove()}
									>
										<TrashIcon className="size-4" />
									</Button>
								</div>
							</div>
							<div className="flex-1 space-y-3 overflow-y-auto p-3">
								{messages.map((message) => (
									<div key={message.id} className="rounded-md bg-muted/40 p-2">
										<p className="text-xs font-semibold uppercase opacity-60">
											{message.role}
										</p>
										<pre className="whitespace-pre-wrap break-words text-sm">
											{message.content}
										</pre>
									</div>
								))}
							</div>
							<div className="flex gap-2 border-t border-border p-3">
								<Input
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											void send();
										}
									}}
									placeholder={t("settings.codingAgents.promptPlaceholder")}
								/>
								<Button
									onClick={() => void send()}
									disabled={busy || !draft.trim()}
									title={t("settings.codingAgents.send")}
								>
									<PaperAirplaneIcon className="size-4" />
								</Button>
							</div>
						</>
					) : (
						<p className="m-auto text-sm text-muted-foreground">
							{t("settings.codingAgents.selectSession")}
						</p>
					)}
				</section>
			</div>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}
		</div>
	);
}
