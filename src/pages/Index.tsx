import { Card } from "@/components/ui/card";

const Index = () => {
  return (
    <main className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold mb-2">VUva OS — Demand Intelligence</h1>
      <p className="text-muted-foreground mb-6">
        Dashboard scaffolding in progress.
      </p>
      <Card className="p-6">
        <p className="text-sm">
          Backend is live. Sign in and trigger discovery to see leads here.
        </p>
      </Card>
    </main>
  );
};

export default Index;