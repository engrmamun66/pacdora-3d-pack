"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

export function UserMenuClient({ name, email, image }: { name: string; email: string; image: string | null }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-8">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Real links, so Ctrl/Cmd+click or the middle button opens them in a new tab. */}
        <DropdownMenuItem nativeButton={false} render={<Link href="/my-dashboard" />}>My dashboard</DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href="/projects" />}>My projects</DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href="/my-dashboard?tab=profile" />}>Profile settings</DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
