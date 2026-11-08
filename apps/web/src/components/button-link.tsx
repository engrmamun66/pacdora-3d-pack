import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type Props = Omit<ComponentProps<typeof Button>, "render" | "nativeButton"> & { href: string };

/** A Button that navigates. Renders a real <a> (nativeButton=false keeps link semantics). */
export function ButtonLink({ href, ...props }: Props) {
  return <Button nativeButton={false} render={<Link href={href} />} {...props} />;
}
