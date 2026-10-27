import { createFileRoute } from "@tanstack/react-router";
import Recruiters from "@/pages/Recruiters";

export const Route = createFileRoute("/_app/recruiters")({ component: Recruiters, head: () => ({ meta: [{ title: "Recruiter partners | Demand Scout Pro" }, { name: "description", content: "Manage international manpower and recruiter partnerships with Voynova." }, { property: "og:title", content: "Recruiter partners | Demand Scout Pro" }, { property: "og:description", content: "Manage international manpower and recruiter partnerships with Voynova." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });
