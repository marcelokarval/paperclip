import { ChevronLeft, MailPlus, MessageSquareShare, Settings, SlidersHorizontal, Tags, UserRoundPlus } from "lucide-react";
import { Link } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useSidebar } from "@/context/SidebarContext";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

export function CompanySettingsSidebar() {
  const { selectedCompany } = useCompany();
  const { isMobile, setSidebarOpen } = useSidebar();

  function closeMobileSidebar() {
    if (isMobile) setSidebarOpen(false);
  }

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        <SidebarCompanyMenu />
      </div>
      <div className="flex flex-col gap-1 px-3 pb-3 shrink-0">
        <Link
          to="/dashboard"
          onClick={closeMobileSidebar}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{selectedCompany?.name ?? "Company"}</span>
        </Link>
        <div className="flex items-center gap-2 px-2 py-1">
          <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate text-sm font-bold text-foreground">
            Company Settings
          </span>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/company/settings#general" label="General" icon={SlidersHorizontal} end />
          <SidebarNavItem to="/company/settings#hiring" label="Hiring" icon={UserRoundPlus} end />
          <SidebarNavItem to="/company/settings#labels" label="Labels" icon={Tags} end />
          <SidebarNavItem to="/company/settings#feedback-sharing" label="Feedback" icon={MessageSquareShare} end />
          <SidebarNavItem to="/company/settings#invites" label="Invites" icon={MailPlus} end />
        </div>
      </nav>
    </aside>
  );
}
