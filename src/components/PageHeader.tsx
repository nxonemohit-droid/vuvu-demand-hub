import type { ReactNode } from "react";

type Props = {
  step: number;
  title: string;
  description: string;
  action?: ReactNode;
};

export const PageHeader = ({ step, title, description, action }: Props) => (
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/10">
        {step}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
    {action}
  </div>
);

export default PageHeader;
