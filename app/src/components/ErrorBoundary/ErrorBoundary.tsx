import { Component, type ErrorInfo, type ReactNode } from "react";
import type { StudioError } from "@/lib/errors";
import { inferStudioError } from "@/lib/errors";
import { CrashScreen } from "./CrashScreen";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: (error: StudioError, retry: () => void) => ReactNode;
	onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
	error: Error | null;
	studioError: StudioError | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { error: null, studioError: null };
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { error, studioError: inferStudioError(error) };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[ErrorBoundary]", error, info.componentStack);
		this.props.onError?.(error, info);
	}

	private handleRetry = (): void => {
		this.setState({ error: null, studioError: null });
	};

	render(): ReactNode {
		if (this.state.error && this.state.studioError) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.studioError, this.handleRetry);
			}
			return (
				<CrashScreen
					error={this.state.studioError}
					onRetry={this.handleRetry}
					originalError={this.state.error}
				/>
			);
		}
		return this.props.children;
	}
}
