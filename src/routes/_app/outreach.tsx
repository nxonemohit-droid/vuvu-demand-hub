import { createFileRoute } from "@tanstack/react-router";
import Outreach from "@/pages/Outreach";

export const Route = createFileRoute("/_app/outreach")({ component: Outreach, head: () => ({ meta: [{ title: "Outreach & delivery proof | Demand Scout Pro" }, { name: "description", content: "Track employer and college outreach with actual WhatsApp delivery receipts." }, { property: "og:title", content: "Outreach & delivery proof | Demand Scout Pro" }, { property: "og:description", content: "Track employer and college outreach with actual WhatsApp delivery receipts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
