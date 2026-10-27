import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { FloatingVideoPlayer } from "./components/FloatingVideoPlayer";

function App() {
	return (
		<>
			<RouterProvider router={router} />
			<FloatingVideoPlayer />
		</>
	);
}

export default App;
