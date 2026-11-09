"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** User icon at the right of the admin header: profile, settings, sign out. */
export function AdminUserMenu({ name, email, image }: { name: string; email: string; image: string | null }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-2 rounded-full py-1 pr-1 pl-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <span className="hidden max-w-40 truncate text-sm sm:block">{name}</span>
        <Avatar className="size-8">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
            <div className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Super admin</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/doraadmin/profile")}>
          <UserRound className="size-4" aria-hidden /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/doraadmin/settings")}>
          <Settings className="size-4" aria-hidden /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/doraadmin/login");
            router.refresh();
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
