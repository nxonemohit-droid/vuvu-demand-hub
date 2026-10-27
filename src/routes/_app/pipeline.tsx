import { createFileRoute } from "@tanstack/react-router";
import Pipeline from "@/pages/Pipeline";

export const Route = createFileRoute("/_app/pipeline")({ component: Pipeline, head: () => ({ meta: [{ title: "Lead pipeline | Demand Scout Pro" }, { name: "description", content: "Manage Voynova lead stages and employer contact records." }, { property: "og:title", content: "Lead pipeline | Demand Scout Pro" }, { property: "og:description", content: "Manage Voynova lead stages and employer contact records." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
