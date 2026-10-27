import { createFileRoute } from "@tanstack/react-router";
import Recruiters from "@/pages/Recruiters";

export const Route = createFileRoute("/_app/recruiters")({ component: Recruiters });
