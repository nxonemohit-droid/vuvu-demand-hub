import { createFileRoute } from "@tanstack/react-router";
import FindLeads from "@/pages/FindLeads";

export const Route = createFileRoute("/_app/find")({ component: FindLeads });
