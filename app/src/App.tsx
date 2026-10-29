import { RouterProvider } from "@tanstack/react-router";
import { FloatingVideoPlayer } from "./components/FloatingVideoPlayer";
import { router } from "./router";

function App() {
	return (
		<>
			<RouterProvider router={router} />
			<FloatingVideoPlayer />
		</>
	);
}

export default App;
