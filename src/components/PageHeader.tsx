import type { ReactNode } from "react";

type Props = {
  step: number;
  title: string;
  description: string;
  action?: ReactNode;
};

export const PageHeader = ({ step, title, description, action }: Props) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
        {step}
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    {action}
  </div>
);

export default PageHeader;
