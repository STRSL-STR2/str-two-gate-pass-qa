import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { 
  Building2, 
  Upload, 
  Database, 
  FileText, 
  History, 
  LayoutDashboard, 
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  Menu,
  UserCircle,
  ChevronLeft,
  PanelLeft,
  PanelLeftClose
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('str2_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('str2_sidebar_collapsed', String(next));
      return next;
    });
  };

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

  const NavLinks = ({ 
    onClick, 
    isMobile = false,
    collapsed = false 
  }: { 
    onClick?: () => void; 
    isMobile?: boolean; 
    collapsed?: boolean;
  }) => (
    <div className="flex flex-col space-y-1.5">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;

        if (collapsed && !isMobile) {
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger
                render={
                  <Link
                    to={item.path}
                    title={item.name}
                    className={cn(
                      "flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200 group relative",
                      isActive
                        ? "bg-blue-600/25 text-blue-400 shadow-sm ring-1 ring-blue-500/40"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/80"
                    )}
                  />
                }
              >
                <item.icon className={cn("h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110", isActive ? "text-blue-400" : "")} />
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-r-full" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="bg-slate-900 border border-slate-700/80 text-white font-medium shadow-xl px-3 py-1.5 text-xs rounded-md">
                {item.name}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClick}
            title={item.name}
            className={cn(
              "flex items-center h-10 px-3 w-full rounded-xl text-sm font-medium transition-all duration-200 group relative",
              isActive
                ? (isMobile 
                    ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-900/40 dark:text-blue-300" 
                    : "bg-blue-600/20 text-blue-400 font-semibold shadow-sm border border-blue-500/30 text-blue-400")
                : (isMobile 
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60" 
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70")
            )}
          >
            <item.icon className={cn(
              "mr-3 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
              isActive 
                ? (isMobile ? "text-blue-700 dark:text-blue-400" : "text-blue-400") 
                : "text-slate-400 group-hover:text-slate-200"
            )} />
            <span className="truncate">{item.name}</span>
            {isActive && !isMobile && (
              <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="h-screen overflow-hidden flex w-full bg-slate-50 dark:bg-slate-950">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-slate-800 bg-slate-900 text-slate-100 h-screen sticky top-0 z-20 select-none",
          "transition-[width] duration-300 ease-in-out shrink-0",
          isCollapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Header */}
        {isCollapsed ? (
          <div className="h-16 flex items-center justify-center border-b border-slate-800/80 bg-slate-950/60 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={toggleSidebar}
                    className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 hover:bg-blue-600/30 hover:border-blue-400 hover:text-blue-300 transition-all cursor-pointer shadow-sm group"
                  />
                }
              >
                <Building2 className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="bg-slate-900 border border-slate-700/80 text-white text-xs">
                <p className="font-semibold text-blue-400">STR2 GP</p>
                <p className="text-[10px] text-slate-400">Click to expand</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-950/60 flex-shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 shadow-sm">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-base font-heading tracking-tight leading-none text-white truncate">STR2 GP</span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">Gate Pass System</span>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded-lg shrink-0"
                    onClick={toggleSidebar}
                  />
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-slate-900 border border-slate-700/80 text-white text-xs">
                Collapse sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-5 px-3 no-scrollbar">
          {!isCollapsed ? (
            <div className="px-3 mb-2 flex items-center justify-between">
              <h2 className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">System Menu</h2>
            </div>
          ) : (
            <div className="w-8 h-px bg-slate-800 mx-auto mb-3" />
          )}
          <NavLinks collapsed={isCollapsed} />
        </div>

        {/* Footer / User Profile Section */}
        {!isCollapsed ? (
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl bg-slate-800/50 border border-slate-800">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase shadow-sm">
                {profile?.username?.charAt(0) || 'U'}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-100 truncate">{profile?.username || 'User'}</span>
                <span className="text-[10px] text-slate-400 capitalize font-medium">{profile?.role || 'Staff'}</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 text-xs font-medium rounded-lg" 
              onClick={signOut}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        ) : (
          <div className="p-2 border-t border-slate-800/80 bg-slate-950/40 flex flex-col items-center gap-2 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer uppercase shadow-sm hover:ring-2 hover:ring-blue-500/50 transition-all" />
                }
              >
                {profile?.username?.charAt(0) || 'U'}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="bg-slate-900 border border-slate-700/80 text-white text-xs">
                <p className="font-semibold text-slate-100">{profile?.username || 'User'}</p>
                <p className="text-[10px] text-slate-400 capitalize">{profile?.role || 'Staff'}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl" 
                    onClick={signOut}
                  />
                }
              >
                <LogOut className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="bg-slate-900 border border-slate-700/80 text-white text-xs">
                Sign Out
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 transition-colors overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10 transition-colors">
          <div className="flex items-center">
            {/* Desktop Collapse/Expand Toggle */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden md:flex mr-3 h-8 w-8 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    onClick={toggleSidebar}
                  />
                }
              >
                {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isCollapsed ? "Expand sidebar" : "Collapse to icon rail"}
              </TooltipContent>
            </Tooltip>
            
            {/* Mobile Sheet Drawer Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger className="md:hidden mr-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-none flex flex-col">
                <div className="h-16 flex items-center px-5 border-b border-slate-800 bg-slate-950/60 text-slate-100 flex-shrink-0 gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-base font-heading tracking-tight leading-none text-white">STR2 GP</span>
                    <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">Gate Pass System</span>
                  </div>
                </div>
                <div className="flex-1 py-5 px-3 overflow-y-auto no-scrollbar">
                  <h2 className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2 px-3">System Menu</h2>
                  <NavLinks onClick={() => setIsMobileOpen(false)} isMobile={true} />
                </div>
                <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex flex-col gap-2">
                  <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl bg-slate-800/50 border border-slate-800">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase shadow-sm">
                      {profile?.username?.charAt(0) || 'U'}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-100 truncate">{profile?.username || 'User'}</span>
                      <span className="text-[10px] text-slate-400 capitalize font-medium">{profile?.role || 'Staff'}</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 text-xs font-medium rounded-lg" 
                    onClick={() => { signOut(); setIsMobileOpen(false); }}
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            
            <h1 className="text-lg font-semibold capitalize hidden sm:block">
              {location.pathname.split('/').filter(Boolean).join(' ').replace(/-/g, ' ') || 'Dashboard'}
            </h1>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate("/profile")}>
              <UserCircle className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </Button>
            <Button 
               variant="ghost" 
               size="icon" 
               className="h-8 w-8 rounded-lg"
               onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-3 sm:p-4 md:p-5 pb-1 md:pb-1 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
