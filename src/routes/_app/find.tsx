import { createFileRoute } from "@tanstack/react-router";
import FindLeads from "@/pages/FindLeads";

export const Route = createFileRoute("/_app/find")({ component: FindLeads, head: () => ({ meta: [{ title: "Find employer leads | Demand Scout Pro" }, { name: "description", content: "Find European employers and colleges for Voynova workforce and student partnerships." }, { property: "og:title", content: "Find employer leads | Demand Scout Pro" }, { property: "og:description", content: "Find European employers and colleges for Voynova workforce and student partnerships." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
