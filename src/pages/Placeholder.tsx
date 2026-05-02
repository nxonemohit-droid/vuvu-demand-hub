import { Card } from "@/components/ui/card";

type Props = { title: string; description: string };

const Placeholder = ({ title, description }: Props) => (
  <div className="p-8">
    <h1 className="text-3xl font-bold mb-2">{title}</h1>
    <p className="text-muted-foreground text-sm mb-6">{description}</p>
    <Card className="p-6 rounded-xl text-sm text-muted-foreground">
      This section is part of an upcoming slice and will be activated soon.
    </Card>
  </div>
);

export default Placeholder;