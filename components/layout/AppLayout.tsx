import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Building2, 
  Upload, 
  Database, FileText, 
  History, 
  LayoutDashboard, 
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  Menu,
  UserCircle,
  Loader2
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopOpen, setIsDesktopOpen] = useState(true);
  

  let navItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Upload Data", path: "/upload", icon: Upload },
    { name: "Master Data", path: "/master-data", icon: Database },
    { name: "Gate Pass Records", path: "/gate-pass/records", icon: History },
    { name: "Invoice Records", path: "/invoice-records", icon: FileText },
  ];

  if (profile?.role === 'viewer') {
    navItems = [
      { name: "Gate Pass Records", path: "/gate-pass/records", icon: History },
    ];
  } else if (profile?.role === 'admin') {
    navItems.push({ name: "Settings", path: "/settings", icon: SettingsIcon });
  }


  const NavLinks = ({ onClick, isMobile = false }: { onClick?: () => void, isMobile?: boolean }) => (
    <div className="flex flex-col space-y-1">
      {navItems.map((item) => (
        <Link
          key={item.path}
          className={buttonVariants({
            variant: "ghost",
            className: cn(
              "justify-start w-full transition-colors",
              location.pathname === item.path 
                ? (isMobile ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/40 dark:text-blue-300" : "bg-blue-600/20 text-blue-400 font-medium hover:bg-blue-600/30 text-blue-400 hover:text-blue-300")
                : (isMobile ? "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800")
            )
          })}
          to={item.path}
          onClick={onClick}
        >
          <item.icon className={cn("mr-3 h-4 w-4", location.pathname === item.path ? (isMobile ? "text-blue-700 dark:text-blue-400" : "text-blue-400") : "")} />
          {item.name}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="h-screen overflow-hidden flex w-full bg-slate-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      {isDesktopOpen && (
        <aside className="hidden md:flex flex-col w-64 border-r bg-slate-900 text-slate-100 h-screen sticky top-0 z-10 transition-colors">
          <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50 flex-shrink-0">
            <Building2 className="h-6 w-6 text-blue-400 mr-2" />
            <span className="font-bold text-lg font-heading tracking-tight">STR2 GP</span>
          </div>
          <div className="flex-1 overflow-y-auto py-6 px-4">
            <h2 className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider mb-3 px-2">System Menu</h2>
            <NavLinks />
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-950/20">
            <div className="flex items-center justify-between mb-2 px-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-200">{profile?.username || 'User'}</span>
                <span className="text-xs text-slate-500 capitalize">{profile?.role}</span>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 transition-colors">
        {/* Top Navbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center">
            {/* Desktop Hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex mr-4"
              onClick={() => setIsDesktopOpen(!isDesktopOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger className="md:hidden mr-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-none flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50 text-slate-100 flex-shrink-0">
                  <Building2 className="h-6 w-6 text-blue-400 mr-2" />
                  <span className="font-bold text-lg font-heading tracking-tight">STR2 GP</span>
                </div>
                <div className="flex-1 py-6 px-4 overflow-y-auto">
                  <h2 className="text-[11px] uppercase text-slate-500 font-semibold tracking-wider mb-3 px-2">System Menu</h2>
                  <NavLinks onClick={() => setIsMobileOpen(false)} isMobile={false} />
                </div>
                <div className="p-4 border-t border-slate-800 bg-slate-950/20">
                  <div className="flex items-center justify-between mb-2 px-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-200">{profile?.username || 'User'}</span>
                      <span className="text-xs text-slate-500 capitalize">{profile?.role}</span>
                    </div>
                  </div>
                  <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => { signOut(); setIsMobileOpen(false); }}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            
            <h1 className="text-lg font-semibold capitalize hidden sm:block">
              {location.pathname.split('/').filter(Boolean).join(' ').replace(/-/g, ' ') || 'Dashboard'}
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/profile")}>
              <UserCircle className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </Button>
            <Button 
               variant="ghost" 
               size="icon" 
               onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <div className="flex-1 p-3 sm:p-4 md:p-5 pb-1 md:pb-1 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>

    </div>
  );
}
