import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

export const Route = createFileRoute("/auth")({ component: Auth, head: () => ({ meta: [{ title: "Sign in | Demand Scout Pro" }, { name: "description", content: "Sign in to Voynova's lead discovery and outreach workspace." }, { property: "og:title", content: "Sign in | Demand Scout Pro" }, { property: "og:description", content: "Sign in to Voynova's lead discovery and outreach workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
