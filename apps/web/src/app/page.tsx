import { Box, Layers, Ruler, Download } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { site } from "@/config/site";

const features = [
  { icon: Ruler, title: "Exact dielines", body: "Enter width, depth and height. Cut, crease, glue, bleed and safe areas are calculated, not drawn by hand." },
  { icon: Layers, title: "2D artwork", body: "Place text, logos and shapes on individual panels of the flat dieline." },
  { icon: Box, title: "3D preview", body: "See the carton fold up with your artwork on the right faces." },
  { icon: Download, title: "Print files", body: "Export SVG and PDF dielines with separate cut and crease layers." },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">{site.name}</span>
        <nav className="flex gap-2">
          <ButtonLink variant="ghost" href="/login">Log in</ButtonLink>
          <ButtonLink href="/register">Get started</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-20">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Packaging dielines that fold the way you designed them.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{site.tagline}</p>
        <div className="flex gap-3">
          <ButtonLink size="lg" href="/register">Create a free account</ButtonLink>
          <ButtonLink size="lg" variant="outline" href="/login">Log in</ButtonLink>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border p-5">
            <Icon className="mb-3 size-5" aria-hidden />
            <h2 className="mb-1 font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
