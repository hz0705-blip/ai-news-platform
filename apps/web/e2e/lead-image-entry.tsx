/** @jsxImportSource react */
import type { LeadImage as LeadImageData } from "@newstrail/db";
import { hydrateRoot } from "react-dom/client";
import { LeadImage } from "../components/lead-image.tsx";

declare global {
  interface Window {
    __LEAD_IMAGE__?: { image: LeadImageData; priority: boolean };
  }
}

const root = document.getElementById("lead-image-fixture");
const props = window.__LEAD_IMAGE__;
if (!root || !props) throw new Error("Missing lead image fixture");
hydrateRoot(root, <LeadImage image={props.image} isDemo={false} priority={props.priority} />);
