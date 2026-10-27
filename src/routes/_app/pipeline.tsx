import { createFileRoute } from "@tanstack/react-router";
import Pipeline from "@/pages/Pipeline";

export const Route = createFileRoute("/_app/pipeline")({ component: Pipeline });
