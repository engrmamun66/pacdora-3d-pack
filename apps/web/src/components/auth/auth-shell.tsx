import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <Link href="/" className="font-semibold">{site.name}</Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
      {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
    </main>
  );
}
