/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { TodayScreen } from "../components/today/today-screen.tsx";
import { demo, FIXED_NOW, live } from "./today-data.ts";

const root = document.getElementById("today-fixture");
if (!root) throw new Error("Missing Today fixture root");
createRoot(root).render(<TodayScreen live={live} demo={demo} now={FIXED_NOW} />);
