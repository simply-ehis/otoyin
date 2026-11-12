import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { FloatingVideoPlayer } from "./components/FloatingVideoPlayer";
import { router } from "./router";

function App() {
	// Drop the static pre-React splash once the shell has committed.
	useEffect(() => {
		document.getElementById("initial-splash")?.remove();
	}, []);

	return (
		<>
			<RouterProvider router={router} />
			<FloatingVideoPlayer />
		</>
	);
}

export default App;
