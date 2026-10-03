import { useEffect, useState, useRef, useMemo, DragEvent } from "react";
import localforage from "localforage";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { CompanySettings, Driver, Location, TimeSlot, Profile, AuditLog } from "@/types";
import { logAuditActivity } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Plus, Trash2, Save, UploadCloud, AlertTriangle, Download, RotateCcw, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, RefreshCw, 
  FileText, Undo2, Shield, Mail, KeyRound, UserPlus, Edit2, Eye, EyeOff, Lock, CheckCircle2, Copy
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY, openOutlookEmailComposer } from "@/lib/gatepass-actions";

interface FileUploaderProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  id: string;
  folder?: "logo" | "signature";
}

function FileUploader({ label, value, onChange, id, folder }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    setIsUploading(true);
    try {
      if (folder) {
        const fileExt = file.name.split(".").pop() || "png";
        const filePath = `${folder}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("company-assets")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (!uploadError) {
          const { data } = supabase.storage
            .from("company-assets")
            .getPublicUrl(filePath);

          onChange(data.publicUrl);
          toast.success(`${label} uploaded successfully.`);
          setIsUploading(false);
          return;
        } else {
          console.warn("Storage upload failed, falling back to base64:", uploadError);
        }
      }

      // Fallback to Base64 data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        onChange(e.target?.result as string);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClick = (e: any) => {
    // If we click on the Clear button, do not open file selector 
    if (e.target.closest('.clear-btn')) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</Label>
      {isUploading ? (
        <div className="border rounded-lg p-4 bg-gray-50/25 dark:bg-slate-900/10 flex flex-col items-center justify-center space-y-2 h-44">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500 mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Uploading image...</p>
        </div>
      ) : value ? (
        <div className="relative border rounded-lg p-4 bg-gray-50/25 dark:bg-slate-900/10 flex flex-col items-center justify-center space-y-2 h-44 group overflow-hidden">
          <img src={value} alt={label} className="max-h-32 object-contain rounded" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
            <Button size="sm" variant="secondary" onClick={handleClick}>Replace</Button>
            <Button size="sm" variant="destructive" className="clear-btn" onClick={() => onChange(null)}>Clear</Button>
          </div>
        </div>
      ) : (
        <div
          id={id}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer h-44 transition-all ${
            isDragging 
              ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" 
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/10 transition-colors"
          }`}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Drag & drop image, or <span className="text-blue-600 dark:text-blue-500 hover:underline">browse</span></p>
          <p className="text-xs text-muted-foreground mt-1.5">PNG, JPG, JPEG up to 2MB</p>
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
          }
        }}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
}


export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("company");
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const { profile } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Activity Logs states
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logActionFilter, setLogActionFilter] = useState("all");
  const [logDateFilter, setLogDateFilter] = useState("all");
  const [logCustomStartDate, setLogCustomStartDate] = useState("");
  const [logCustomEndDate, setLogCustomEndDate] = useState("");
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const logPageSize = 100;

  // New item states
  const [newDriver, setNewDriver] = useState({ driver_name: "", vehicle_number: "", phone_number: "", nic: "" });
  const [newLocation, setNewLocation] = useState("");
  const [newTimeSlot, setNewTimeSlot] = useState("");
  
  // User hierarchy helpers
  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  // Advanced User Management states
  const [userSearch, setUserSearch] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Edit Role modal states
  const [editRoleUser, setEditRoleUser] = useState<Profile | null>(null);
  const [selectedEditRole, setSelectedEditRole] = useState("user");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Custom Reset Password modal states
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Email Template states
  const [emailSubject, setEmailSubject] = useState(() => {
    return localStorage.getItem("gate_pass_email_subject") || DEFAULT_EMAIL_SUBJECT;
  });
  const [emailBody, setEmailBody] = useState(() => {
    return localStorage.getItem("gate_pass_email_body") || DEFAULT_EMAIL_BODY;
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'driver' | 'location' | 'timeSlot' | 'user' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (err: any) {
      console.error("Error fetching audit logs:", err);
      toast.error(`Error loading activity logs: ${err.message}`);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === "logs") {
      fetchLogs();
    }
  }, [activeTab]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search filter
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const matchUser = (log.performed_by || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchEntity = (log.entity_id || '').toLowerCase().includes(q) || (log.entity_type || '').toLowerCase().includes(q);
        const matchDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        if (!matchUser && !matchAction && !matchEntity && !matchDetails) return false;
      }

      // Action filter
      if (logActionFilter !== 'all') {
        if (logActionFilter === 'reversals') {
          if (log.action !== 'GATE_PASS_UNPOSTED' && log.action !== 'GATE_PASS_UNDISPATCHED') return false;
        } else if (logActionFilter === 'users') {
          if (!log.action.startsWith('USER_')) return false;
        } else if (logActionFilter === 'gatepass') {
          if (!log.action.startsWith('GATE_PASS_')) return false;
        } else if (log.action !== logActionFilter) {
          return false;
        }
      }

      // Date filter
      if (logDateFilter !== 'all') {
        const logDate = new Date(log.created_at);
        const now = new Date();
        if (logDateFilter === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (logDate < today) return false;
        } else if (logDateFilter === 'this-week') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          if (logDate < startOfWeek) return false;
        } else if (logDateFilter === 'this-month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (logDate < startOfMonth) return false;
        } else if (logDateFilter === 'custom') {
          if (logCustomStartDate) {
            const start = new Date(logCustomStartDate);
            start.setHours(0, 0, 0, 0);
            if (logDate < start) return false;
          }
          if (logCustomEndDate) {
            const end = new Date(logCustomEndDate);
            end.setHours(23, 59, 59, 999);
            if (logDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [logs, logSearch, logActionFilter, logDateFilter, logCustomStartDate, logCustomEndDate]);

  const totalLogPages = Math.ceil(filteredLogs.length / logPageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (logCurrentPage - 1) * logPageSize;
    return filteredLogs.slice(start, start + logPageSize);
  }, [filteredLogs, logCurrentPage, logPageSize]);

  const handleExportLogsExcel = () => {
    if (filteredLogs.length === 0) {
      toast.error("No activity logs to export.");
      return;
    }
    const exportData = filteredLogs.map(l => ({
      "Timestamp": format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss'),
      "Performed By": l.performed_by || "System",
      "Action": l.action,
      "Entity Type": l.entity_type || "-",
      "Entity ID": l.entity_id || "-",
      "Details": JSON.stringify(l.details || {})
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activity Logs");
    XLSX.writeFile(wb, `System_Activity_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success("Activity logs exported successfully.");
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: cs },
        { data: drv },
        { data: loc },
        { data: ts },
        { data: prof }
      ] = await Promise.all([
        supabase.from('company_settings').select('*').limit(1).single(),
        supabase.from('drivers').select('*'),
        supabase.from('delivery_locations').select('*'),
        supabase.from('time_slots').select('*'),
        supabase.from('app_users').select('id, username, email, role, is_active, created_at').order('username')
      ]);

      if (cs) {
        if (!cs.logo_url) {
          cs.logo_url = localStorage.getItem('gate_pass_logo') || "";
        } else {
          localStorage.setItem('gate_pass_logo', cs.logo_url);
        }

        if (cs.signature_url) {
          setSignature(cs.signature_url);
          localStorage.setItem('gate_pass_signature', cs.signature_url);
        } else {
          const savedSig = localStorage.getItem('gate_pass_signature');
          setSignature(savedSig || "");
        }

        setCompanySettings(cs);
      }
      if (drv) setDrivers(drv);
      if (loc) setLocations(loc);
      if (ts) setTimeSlots(ts);
      if (prof) setProfiles(prof);
    } catch (err: any) {
      toast.error(`Error loading settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  
  const handleBackupData = async () => {
    try {
      toast.info("Generating system backup file...");
      
      const wb = XLSX.utils.book_new();

      // 1. Fetch Gate Pass Records
      const { data: gpRecords } = await supabase
        .from('gate_pass_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (gpRecords && gpRecords.length > 0) {
        // Sheet 1: Detailed Gate Pass Item Rows
        const flatGpData = gpRecords.flatMap(gp => {
          const rows = Array.isArray(gp.rows) ? gp.rows : [];
          if (rows.length === 0) {
            return [{
              "Gate Pass No": gp.gate_pass_no || "-",
              "Status": (gp.status || "COMPLETED").toUpperCase(),
              "Date": gp.date || "-",
              "Time Slot": gp.time_slot || gp.time || "-",
              "Delivery Location": gp.location || "-",
              "Vehicle Number": gp.vehicle_number || "-",
              "Driver Name": gp.driver_name || "-",
              "Driver NIC": gp.nic || "-",
              "Driver Phone": gp.phone_number || "-",
              "Customer": gp.customer_name || "-",
              "Invoice No": "-",
              "Buyer": "-",
              "PO / Order": "-",
              "DO / BOL": "-",
              "Qty (Mtrs)": Number(gp.total_mtrs) || 0,
              "Cartons": Number(gp.total_cartons) || 0,
              "Value": Number(gp.total_value) || 0,
              "Remark": "-",
              "Created By": gp.created_by || "-",
              "Created At": gp.created_at ? new Date(gp.created_at).toLocaleString() : "-"
            }];
          }
          return rows.map((row: any) => ({
            "Gate Pass No": gp.gate_pass_no || "-",
            "Status": (gp.status || "COMPLETED").toUpperCase(),
            "Date": gp.date || "-",
            "Time Slot": gp.time_slot || gp.time || "-",
            "Delivery Location": gp.location || "-",
            "Vehicle Number": gp.vehicle_number || "-",
            "Driver Name": gp.driver_name || "-",
            "Driver NIC": gp.nic || "-",
            "Driver Phone": gp.phone_number || "-",
            "Customer": gp.customer_name || "-",
            "Invoice No": row.invoice || "-",
            "Buyer": row.buyer || "-",
            "PO / Order": row.po || "-",
            "DO / BOL": row.do || "-",
            "Qty (Mtrs)": Number(row.mtrs) || 0,
            "Cartons": Number(row.cartons) || 0,
            "Value": Number(row.value) || 0,
            "Remark": row.remark || "",
            "Created By": gp.created_by || "-",
            "Created At": gp.created_at ? new Date(gp.created_at).toLocaleString() : "-"
          }));
        });
        const wsGp = XLSX.utils.json_to_sheet(flatGpData);
        XLSX.utils.book_append_sheet(wb, wsGp, "Gate Pass Items");

        // Sheet 2: Gate Pass Summary
        const summaryGpData = gpRecords.map(gp => ({
          "Gate Pass No": gp.gate_pass_no || "-",
          "Status": (gp.status || "COMPLETED").toUpperCase(),
          "Date": gp.date || "-",
          "Time Slot": gp.time_slot || gp.time || "-",
          "Delivery Location": gp.location || "-",
          "Vehicle Number": gp.vehicle_number || "-",
          "Driver Name": gp.driver_name || "-",
          "Driver NIC": gp.nic || "-",
          "Driver Phone": gp.phone_number || "-",
          "Customer / Buyer": gp.customer_name || "-",
          "Total Invoices": gp.invoice_count || (Array.isArray(gp.rows) ? gp.rows.length : 0),
          "Total Qty (Mtrs)": Number(gp.total_mtrs) || 0,
          "Total Cartons": Number(gp.total_cartons) || 0,
          "Total Value": Number(gp.total_value) || 0,
          "Created By": gp.created_by || "-",
          "Created At": gp.created_at ? new Date(gp.created_at).toLocaleString() : "-"
        }));
        const wsGpSummary = XLSX.utils.json_to_sheet(summaryGpData);
        XLSX.utils.book_append_sheet(wb, wsGpSummary, "Gate Pass Summary");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Message": "No Gate Passes Found" }]), "Gate Passes");
      }

      // 2. Fetch Drivers Table
      const { data: dbDrivers } = await supabase.from('drivers').select('*').order('driver_name');
      const driverList = dbDrivers && dbDrivers.length > 0 ? dbDrivers : drivers;
      if (driverList.length > 0) {
        const driversData = driverList.map(d => ({
          "Driver Name": d.driver_name,
          "Vehicle Number": d.vehicle_number,
          "Phone Number": d.phone_number || "-",
          "NIC Number": d.nic || "-",
          "Created Date": (d as any).created_at ? new Date((d as any).created_at).toLocaleString() : "-"
        }));
        const wsDrivers = XLSX.utils.json_to_sheet(driversData);
        XLSX.utils.book_append_sheet(wb, wsDrivers, "Drivers");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Message": "No Drivers Found" }]), "Drivers");
      }

      // 3. Fetch Delivery Locations Table
      const { data: dbLocations } = await supabase.from('delivery_locations').select('*').order('location_name');
      const locationList = dbLocations && dbLocations.length > 0 ? dbLocations : locations;
      if (locationList.length > 0) {
        const locationsData = locationList.map(l => ({
          "Location Name": l.location_name,
          "Status": l.is_active !== false ? "Active" : "Inactive",
          "Created Date": (l as any).created_at ? new Date((l as any).created_at).toLocaleString() : "-"
        }));
        const wsLocations = XLSX.utils.json_to_sheet(locationsData);
        XLSX.utils.book_append_sheet(wb, wsLocations, "Locations");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Message": "No Locations Found" }]), "Locations");
      }

      // 4. Fetch Time Slots Table
      const { data: dbTimeSlots } = await supabase.from('time_slots').select('*').order('label');
      const timeSlotList = dbTimeSlots && dbTimeSlots.length > 0 ? dbTimeSlots : timeSlots;
      if (timeSlotList.length > 0) {
        const timeSlotsData = timeSlotList.map(t => ({
          "Time Slot Window": t.label,
          "Status": t.is_active !== false ? "Active" : "Inactive",
          "Created Date": (t as any).created_at ? new Date((t as any).created_at).toLocaleString() : "-"
        }));
        const wsTimeSlots = XLSX.utils.json_to_sheet(timeSlotsData);
        XLSX.utils.book_append_sheet(wb, wsTimeSlots, "Time Slots");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Message": "No Time Slots Found" }]), "Time Slots");
      }

      // 5. Fetch Organization Info Table
      const orgData = [{
        "Organization Name": companySettings?.company_name || "-",
        "Business Address": companySettings?.business_address || "-",
        "Registered Address": companySettings?.registered_address || "-",
        "Contact Details": companySettings?.contact_line || "-",
        "Logo Configured": companySettings?.logo_url ? "Yes" : "No",
        "Signature Configured": signature ? "Yes" : "No"
      }];
      const wsOrg = XLSX.utils.json_to_sheet(orgData);
      XLSX.utils.book_append_sheet(wb, wsOrg, "Organization Info");

      // 6. Fetch System Users Table (Safe export without passwords)
      const { data: dbUsers } = await supabase.from('app_users').select('username, email, role, is_active, created_at').order('username');
      const userList = dbUsers && dbUsers.length > 0 ? dbUsers : profiles;
      if (userList.length > 0) {
        const usersData = userList.map(u => ({
          "Username": u.username,
          "Email": u.email || "-",
          "Role": (u.role || "user").toUpperCase(),
          "Status": u.is_active ? "Active" : "Disabled",
          "Account Created": u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"
        }));
        const wsUsers = XLSX.utils.json_to_sheet(usersData);
        XLSX.utils.book_append_sheet(wb, wsUsers, "System Users");
      }

      // 7. Fetch Master Data (Invoices from localforage)
      const masterData = await localforage.getItem("masterData");
      if (masterData && Array.isArray(masterData) && masterData.length > 0) {
        const formattedMaster = masterData.map((row: any) => ({
          "Invoice No": row.invoice || "-",
          "Buyer / Customer": row.name || "-",
          "Invoice Date": row.invoice_date || "-",
          "Order No": row.order_no || "-",
          "Line": row.line || "-",
          "Release": row.release || "-",
          "Qty Invoiced": Number(row.qty_invoiced) || 0,
          "Extended Price": Number(row.extended_price) || 0,
          "DO / BOL": row.do_bol || "-",
          "Ship Via": row.ship_via_description || "-",
          "Consignee Address": row.consignee_address_3 || "-",
          "Customer PO": row.cust_po || "-",
          "Cartons": Number(row.cartons) || 0,
          "Gate Pass Issued": row.gate_pass_issued || "No"
        }));
        const wsMaster = XLSX.utils.json_to_sheet(formattedMaster);
        XLSX.utils.book_append_sheet(wb, wsMaster, "Master Invoices");
      }

      // 8. Fetch Audit Logs
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (auditLogs && auditLogs.length > 0) {
        const formattedLogs = auditLogs.map(l => ({
          "Timestamp": l.created_at ? new Date(l.created_at).toLocaleString() : "-",
          "Performed By": l.performed_by || "System",
          "Action": l.action,
          "Entity Type": l.entity_type || "-",
          "Entity ID": l.entity_id || "-",
          "Details": JSON.stringify(l.details || {})
        }));
        const wsLogs = XLSX.utils.json_to_sheet(formattedLogs);
        XLSX.utils.book_append_sheet(wb, wsLogs, "Activity Logs");
      }

      // Auto-fit column widths for every worksheet
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (ws && ws["!ref"]) {
          const range = XLSX.utils.decode_range(ws["!ref"]);
          const colWidths: { wch: number }[] = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            let maxLen = 12;
            for (let R = range.s.r; R <= range.e.r; ++R) {
              const cell = ws[XLSX.utils.encode_cell({ c: C, r: R })];
              if (cell && cell.v !== undefined && cell.v !== null) {
                const len = String(cell.v).length;
                if (len > maxLen) maxLen = Math.min(len + 2, 50);
              }
            }
            colWidths.push({ wch: maxLen });
          }
          ws["!cols"] = colWidths;
        }
      }

      // Download file with standard timestamped filename
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `STR2_System_Backup_${dateStr}.xlsx`);
      toast.success("Complete system backup downloaded with separate sheets.");

    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate backup: " + (err.message || "Unknown error"));
    }
  };


  const handleSaveCompanyInfo = async () => {
    if (!companySettings) return;
    try {
      // 1. Try to save logo_url and signature_url to Supabase table company_settings
      const { error } = await supabase
        .from('company_settings')
        .update({
          company_name: companySettings.company_name,
          business_address: companySettings.business_address,
          registered_address: companySettings.registered_address,
          contact_line: companySettings.contact_line,
          logo_url: companySettings.logo_url,
          signature_url: signature
        })
        .eq('id', companySettings.id);

      if (error) {
        console.warn("Could not save to Supabase company_settings:", error);
      }
      
      // 2. Save both consistently to localStorage so they are guaranteed to work instantly
      if (companySettings.logo_url) {
        localStorage.setItem('gate_pass_logo', companySettings.logo_url);
      } else {
        localStorage.removeItem('gate_pass_logo');
      }

      if (signature) {
        localStorage.setItem('gate_pass_signature', signature);
      } else {
        localStorage.removeItem('gate_pass_signature');
      }

      toast.success("Company information and signature saved successfully.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddDriver = async () => {
    if (!newDriver.driver_name || !newDriver.vehicle_number) return;
    try {
      const { error, data } = await supabase.from('drivers').insert([newDriver]).select();
      if (error) throw error;
      if (data) setDrivers([...drivers, data[0]]);
      setNewDriver({ driver_name: "", vehicle_number: "", phone_number: "", nic: "" });
      toast.success("Driver added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteDriver = (id: string) => {
    setDeleteConfirm({ id, type: 'driver' });
  };

  const handleAddLocation = async () => {
    if (!newLocation) return;
    try {
      const { error, data } = await supabase.from('delivery_locations').insert([{ location_name: newLocation }]).select();
      if (error) throw error;
      if (data) setLocations([...locations, data[0]]);
      setNewLocation("");
      toast.success("Location added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteLocation = (id: string) => {
    setDeleteConfirm({ id, type: 'location' });
  };

  const handleAddTimeSlot = async () => {
    if (!newTimeSlot) return;
    try {
      const { error, data } = await supabase.from('time_slots').insert([{ label: newTimeSlot }]).select();
      if (error) throw error;
      if (data) setTimeSlots([...timeSlots, data[0]]);
      setNewTimeSlot("");
      toast.success("Time slot added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteTimeSlot = (id: string) => {
    setDeleteConfirm({ id, type: 'timeSlot' });
  };

  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return profiles;
    const q = userSearch.toLowerCase();
    return profiles.filter(p => 
      p.username.toLowerCase().includes(q) || 
      (p.email || '').toLowerCase().includes(q) || 
      (p.role || '').toLowerCase().includes(q)
    );
  }, [profiles, userSearch]);

  const handleOpenAddUser = () => {
    setNewUsername("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("user");
    setShowAddUserPassword(false);
    setIsAddUserOpen(true);
  };

  const handleAddUser = async () => {
    if (!newUsername.trim() || !newUserPassword) {
      toast.error("Username and Password are required.");
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newUserRole === 'super_admin' && !isSuperAdmin) {
      toast.error("Only Super Admins can assign the Super Admin role.");
      return;
    }

    setIsAddingUser(true);
    try {
      const { error } = await supabase.rpc('admin_create_user', {
        p_username: newUsername.trim(),
        p_email: newUserEmail.trim() || null,
        p_password: newUserPassword,
        p_role: newUserRole
      });

      if (error) throw error;
      
      await logAuditActivity({
        action: 'USER_CREATED',
        entity_type: 'user',
        entity_id: newUsername.trim(),
        details: { role: newUserRole, email: newUserEmail.trim() || null },
        performed_by: profile?.username || 'Admin'
      });

      toast.success(`User '${newUsername.trim()}' created successfully.`);
      setIsAddUserOpen(false);
      setNewUsername("");
      setNewUserEmail("");
      setNewUserPassword("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create user.");
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleOpenEditRole = (target: Profile) => {
    if (target.role === 'super_admin' && !isSuperAdmin) {
      toast.error("Standard Admins cannot edit Super Admin accounts.");
      return;
    }
    setEditRoleUser(target);
    setSelectedEditRole(target.role || 'user');
  };

  const handleUpdateRole = async () => {
    if (!editRoleUser) return;
    if (editRoleUser.role === 'super_admin' && !isSuperAdmin) {
      toast.error("Standard Admins cannot modify Super Admin accounts.");
      return;
    }
    if (selectedEditRole === 'super_admin' && !isSuperAdmin) {
      toast.error("Only a Super Admin can promote a user to Super Admin.");
      return;
    }

    setIsUpdatingRole(true);
    try {
      const { error: rpcErr } = await supabase.rpc('admin_update_user_role', {
        p_user_id: editRoleUser.id,
        p_new_role: selectedEditRole
      });

      if (rpcErr) {
        // Fallback to direct table update
        const { error: tblErr } = await supabase
          .from('app_users')
          .update({ role: selectedEditRole })
          .eq('id', editRoleUser.id);
        if (tblErr) throw tblErr;
      }

      await logAuditActivity({
        action: 'USER_ROLE_UPDATED',
        entity_type: 'user',
        entity_id: editRoleUser.username,
        details: { previous_role: editRoleUser.role, new_role: selectedEditRole },
        performed_by: profile?.username || 'Admin'
      });

      toast.success(`Role for ${editRoleUser.username} updated to ${selectedEditRole}.`);
      setProfiles(prev => prev.map(p => p.id === editRoleUser.id ? { ...p, role: selectedEditRole } : p));
      setEditRoleUser(null);
    } catch (err: any) {
      toast.error("Failed to update role: " + (err.message || "Unknown error"));
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleOpenResetPassword = (target: Profile) => {
    if (target.role === 'super_admin' && !isSuperAdmin) {
      toast.error("Standard Admins cannot reset passwords for Super Admin accounts.");
      return;
    }
    setResetPasswordUser(target);
    setNewResetPassword("");
    setShowResetPassword(false);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordUser) return;
    if (resetPasswordUser.role === 'super_admin' && !isSuperAdmin) {
      toast.error("Standard Admins cannot reset passwords for Super Admin accounts.");
      return;
    }
    if (!newResetPassword || newResetPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error: rpcErr } = await supabase.rpc('admin_reset_user_password', {
        p_user_id: resetPasswordUser.id,
        p_new_password: newResetPassword
      });

      if (rpcErr) throw rpcErr;

      await logAuditActivity({
        action: 'USER_PASSWORD_RESET',
        entity_type: 'user',
        entity_id: resetPasswordUser.username,
        details: { reset_type: 'custom_password' },
        performed_by: profile?.username || 'Admin'
      });

      toast.success(`Password for ${resetPasswordUser.username} has been reset successfully.`);
      setResetPasswordUser(null);
      setNewResetPassword("");
    } catch (err: any) {
      toast.error("Failed to reset password: " + (err.message || "Unknown error"));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteUser = (id: string) => {
    const targetUser = profiles.find(p => p.id === id);
    if (!targetUser) return;
    if (targetUser.id === profile?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }
    if (targetUser.username === 'admin') {
      toast.error("The primary system administrator account cannot be deleted.");
      return;
    }
    if (targetUser.role === 'super_admin' && !isSuperAdmin) {
      toast.error("Standard Admins cannot delete Super Admin accounts.");
      return;
    }
    setDeleteConfirm({ id, type: 'user' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    const { id, type } = deleteConfirm;
    
    try {
      if (type === 'driver') {
        await supabase.from('drivers').delete().eq('id', id);
        setDrivers(drivers.filter(d => d.id !== id));
        toast.success("Driver deleted");
      } else if (type === 'location') {
        await supabase.from('delivery_locations').delete().eq('id', id);
        setLocations(locations.filter(d => d.id !== id));
        toast.success("Location deleted");
      } else if (type === 'timeSlot') {
        await supabase.from('time_slots').delete().eq('id', id);
        setTimeSlots(timeSlots.filter(d => d.id !== id));
        toast.success("Time slot deleted");
      } else if (type === 'user') {
        const targetUser = profiles.find(p => p.id === id);
        if (targetUser?.role === 'super_admin' && !isSuperAdmin) {
          toast.error("Standard Admins cannot delete Super Admin accounts.");
          return;
        }
        const { error: rpcErr } = await supabase.rpc('admin_delete_user', { p_user_id: id });
        if (rpcErr) {
          const { error } = await supabase.from('app_users').delete().eq('id', id);
          if (error) throw error;
        }

        await logAuditActivity({
          action: 'USER_DELETED',
          entity_type: 'user',
          entity_id: targetUser?.username || id,
          details: { role: targetUser?.role },
          performed_by: profile?.username || 'Admin'
        });

        setProfiles(profiles.filter(p => p.id !== id));
        toast.success("User deleted successfully.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleSaveEmailTemplate = () => {
    localStorage.setItem("gate_pass_email_subject", emailSubject);
    localStorage.setItem("gate_pass_email_body", emailBody);
    toast.success("Gate pass email template saved successfully.");
  };

  const handleResetEmailTemplate = () => {
    setEmailSubject(DEFAULT_EMAIL_SUBJECT);
    setEmailBody(DEFAULT_EMAIL_BODY);
    localStorage.setItem("gate_pass_email_subject", DEFAULT_EMAIL_SUBJECT);
    localStorage.setItem("gate_pass_email_body", DEFAULT_EMAIL_BODY);
    toast.success("Email template reset to default settings.");
  };

  const handleTestEmailInOutlook = () => {
    openOutlookEmailComposer({
      gate_pass_no: "STR2GP-26-JAN-0001",
      date: format(new Date(), "yyyy-MM-dd"),
      time: "08:00 AM - 10:00 AM",
      location: "Colombo Logistics Center",
      vehicle_number: "WP-CAB-1234",
      driver_name: "Kamal Perera",
      phone_number: "0771234567",
      nic: "851234567V",
      customer_name: "Brandix Apparel Solutions",
      total_cartons: 45,
      total_mtrs: 1250,
      total_value: 3840.50,
      invoice_count: 3
    });
  };

  if (loading) {
    return <div className="flex justify-center mt-32"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full space-y-4 overflow-hidden pt-4 pb-2">
      <div className="flex flex-col w-full flex-1 overflow-hidden px-2 md:px-4">
        <nav className="flex flex-row overflow-x-auto w-full bg-transparent gap-2 items-center justify-start pb-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 no-scrollbar">
          {[
            { id: "company", label: "Organization Info" },
            { id: "drivers", label: "Drivers" },
            { id: "locations", label: "Locations" },
            { id: "times", label: "Time Slots" },
            { id: "users", label: "System Users" },
            { id: "email", label: "Email Template" },
            { id: "logs", label: "Activity Logs" },
            { id: "backup", label: "System Backup" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-2 px-4 text-sm font-medium rounded-full transition-all ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 w-full min-w-0 overflow-hidden pt-4 pb-2 pr-2 flex flex-col">

        {/* Company Settings */}
        {activeTab === "company" && (<div className="h-full overflow-y-auto pb-8 pr-2">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <CardTitle className="text-base font-semibold">Organization Information</CardTitle>
              <CardDescription className="text-xs mt-0.5">Details configured here will appear on printed gate passes.</CardDescription>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Organization Name</Label>
                  <Input 
                    value={companySettings?.company_name || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, company_name: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900 h-10 w-full"
                    placeholder="e.g. Star Garments Group"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contact Details (Tel/Fax/Email)</Label>
                  <Input 
                    value={companySettings?.contact_line || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, contact_line: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900 h-10 w-full"
                    placeholder="Tel: +94 11 1234567 | Fax: +94 11 1234568 | Email: info@example.com"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Business Address</Label>
                  <textarea 
                    rows={2}
                    value={companySettings?.business_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, business_address: e.target.value} : null)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300 resize-y"
                    placeholder="Operational / Facility Address"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Registered Address</Label>
                  <textarea 
                    rows={2}
                    value={companySettings?.registered_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, registered_address: e.target.value} : null)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300 resize-y"
                    placeholder="Official Registered Address"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 w-full">
                <FileUploader
                  label="Company Logo"
                  value={companySettings?.logo_url || null}
                  onChange={(val) => setCompanySettings(prev => prev ? { ...prev, logo_url: val || "" } : null)}
                  id="logo-upload"
                  folder="logo"
                />
                <FileUploader
                  label="Authorized Signature"
                  value={signature}
                  onChange={(val) => setSignature(val)}
                  id="signature-upload"
                  folder="signature"
                />
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 p-4">
              <Button onClick={handleSaveCompanyInfo} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                <Save className="mr-2 h-4 w-4" /> Save Organization Settings
              </Button>
            </CardFooter>
          </Card>
        </div>)}

        {/* Drivers */}
        {activeTab === "drivers" && (<div className="flex flex-col h-full">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Drivers Registry</CardTitle>
                <CardDescription className="text-xs text-slate-500">Manage approved drivers and their primary vehicles.</CardDescription>
              </div>
              <div className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                {drivers.length} Drivers
              </div>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-2 shrink-0 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                <div className="flex flex-col md:flex-row gap-2 items-end">
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Driver Name *</Label>
                    <Input className="h-8 text-xs bg-white dark:bg-slate-950" value={newDriver.driver_name} onChange={e => setNewDriver({...newDriver, driver_name: e.target.value})} placeholder="Driver name" />
                  </div>
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Vehicle No *</Label>
                    <Input className="h-8 text-xs bg-white dark:bg-slate-950 uppercase" value={newDriver.vehicle_number} onChange={e => setNewDriver({...newDriver, vehicle_number: e.target.value})} placeholder="ABC-1234" />
                  </div>
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Phone No</Label>
                    <Input className="h-8 text-xs bg-white dark:bg-slate-950" value={newDriver.phone_number} onChange={e => setNewDriver({...newDriver, phone_number: e.target.value})} placeholder="071..." />
                  </div>
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">NIC</Label>
                    <Input className="h-8 text-xs bg-white dark:bg-slate-950" value={newDriver.nic} onChange={e => setNewDriver({...newDriver, nic: e.target.value})} placeholder="NIC number" />
                  </div>
                  <Button onClick={handleAddDriver} size="sm" className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-8 text-xs px-3 w-full md:w-auto shrink-0">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Driver
                  </Button>
                </div>
              </div>
              <div className="flex-1 w-full overflow-auto">
                <Table className="min-w-[600px]">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Driver Name</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Vehicle No</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Phone</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">NIC</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500 py-8">No drivers added yet</TableCell>
                      </TableRow>
                    ) : (
                    drivers.map(d => (
                      <TableRow key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <TableCell className="font-medium">{d.driver_name}</TableCell>
                        <TableCell><span className="border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide">{d.vehicle_number}</span></TableCell>
                        <TableCell className="text-slate-500">{d.phone_number || "-"}</TableCell>
                        <TableCell className="text-slate-500">{d.nic || "-"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDriver(d.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>)}

        {/* Locations */}
        {activeTab === "locations" && (<div className="flex flex-col h-full">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col md:flex-row gap-4 justify-between items-center w-full">
              <CardTitle className="text-sm font-semibold whitespace-nowrap">Delivery Locations</CardTitle>
              <div className="flex items-center gap-2 w-full md:max-w-md">
                <div className="flex-1 w-full relative">
                  <Input className="h-8 text-xs bg-white dark:bg-slate-950 w-full" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. MAS Holdings HQ" />
                </div>
                <Button onClick={handleAddLocation} size="sm" className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-8 text-xs px-3 shrink-0">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 w-full overflow-auto relative">
                <Table className="min-w-[400px]">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Location Details</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-slate-500 py-8">No locations added yet</TableCell>
                      </TableRow>
                    ) : (
                    locations.map(d => (
                      <TableRow key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <TableCell className="font-medium text-slate-700 dark:text-slate-300">{d.location_name}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteLocation(d.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>)}

        {/* Time Slots */}
        {activeTab === "times" && (<div className="flex flex-col h-full">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col md:flex-row gap-4 justify-between items-center w-full">
              <CardTitle className="text-sm font-semibold whitespace-nowrap">Delivery Time Slots</CardTitle>
              <div className="flex items-center gap-2 w-full md:max-w-md">
                <div className="flex-1 w-full relative">
                  <Input className="h-8 text-xs bg-white dark:bg-slate-950 w-full" value={newTimeSlot} onChange={e => setNewTimeSlot(e.target.value)} placeholder="e.g. 08:00 AM - 10:00 AM" />
                </div>
                <Button onClick={handleAddTimeSlot} size="sm" className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-8 text-xs px-3 shrink-0">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 w-full overflow-auto relative">
                <Table className="min-w-[400px]">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Time Slot</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeSlots.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-slate-500 py-8">No time slots added yet</TableCell>
                      </TableRow>
                    ) : (
                    timeSlots.map(d => (
                      <TableRow key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <TableCell className="font-medium text-slate-700 dark:text-slate-300">{d.label}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTimeSlot(d.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>)}

        {/* Users */}
        {activeTab === "users" && (<div className="flex flex-col h-full">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  System Users
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Manage login accounts, assign roles, and handle password credentials.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <div className="relative min-w-[140px] max-w-[200px] flex-1 sm:flex-initial">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    value={userSearch} 
                    onChange={e => setUserSearch(e.target.value)} 
                    placeholder="Search users..."
                    className="h-8 pl-8 text-xs bg-white dark:bg-slate-950 w-full"
                  />
                </div>
                <div className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {filteredProfiles.length} Users
                </div>
                {isAdmin && (
                  <Button 
                    onClick={handleOpenAddUser} 
                    size="sm" 
                    className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-8 text-xs px-3 shadow-xs shrink-0"
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add User
                  </Button>
                )}
              </div>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 w-full overflow-auto">
                <Table className="min-w-[750px]">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-44 font-semibold text-slate-700 dark:text-slate-200 text-xs">Username</TableHead>
                      <TableHead className="w-56 font-semibold text-slate-700 dark:text-slate-200 text-xs">Email</TableHead>
                      <TableHead className="w-36 font-semibold text-slate-700 dark:text-slate-200 text-xs">Account Role</TableHead>
                      <TableHead className="w-28 font-semibold text-slate-700 dark:text-slate-200 text-xs">Status</TableHead>
                      <TableHead className="w-32 font-semibold text-slate-700 dark:text-slate-200 text-xs">Joined</TableHead>
                      <TableHead className="w-60 font-semibold text-slate-700 dark:text-slate-200 text-xs text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                          No users found matching your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProfiles.map(p => {
                        const isTargetSuperAdmin = p.role === 'super_admin';
                        const canManageUser = isSuperAdmin || (!isTargetSuperAdmin && isAdmin);

                        return (
                          <TableRow key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{p.username}</span>
                                {isTargetSuperAdmin && (
                                  <span title="Super Admin Account"><Shield className="h-3.5 w-3.5 text-purple-600" /></span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-500">{p.email || '-'}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                p.role === 'super_admin'
                                  ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300'
                                  : p.role === 'admin'
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300'
                                    : p.role === 'viewer'
                                      ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                                      : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 capitalize'
                              }`}>
                                {p.role === 'super_admin' ? 'Super Admin' : p.role === 'viewer' ? 'Viewer' : p.role === 'admin' ? 'Admin' : 'User'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="text-xs text-slate-600 dark:text-slate-400">{p.is_active ? 'Active' : 'Disabled'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-500 text-xs">{new Date(p.created_at || new Date()).toLocaleDateString()}</TableCell>
                            <TableCell className="w-60 text-center">
                              <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                {!canManageUser ? (
                                  <span className="inline-flex items-center justify-center text-[11px] text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800 font-medium h-7 shadow-2xs">
                                    <Lock className="h-3 w-3 mr-1" /> Protected Account
                                  </span>
                                ) : (
                                  <>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => handleOpenEditRole(p)} 
                                      className="h-7 text-xs px-2.5 font-medium border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 transition-colors shadow-2xs"
                                      title="Change User Role"
                                    >
                                      <Edit2 className="h-3 w-3 mr-1 text-indigo-500" />
                                      <span>Role</span>
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => handleOpenResetPassword(p)} 
                                      className="h-7 text-xs px-2.5 font-medium border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 transition-colors shadow-2xs"
                                      title="Reset Password"
                                    >
                                      <KeyRound className="h-3 w-3 mr-1 text-amber-500" />
                                      <span>Reset PW</span>
                                    </Button>
                                    {p.username !== 'admin' && p.id !== profile?.id ? (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleDeleteUser(p.id)} 
                                        className="h-7 w-7 p-0 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50/80 dark:hover:bg-red-950/40 transition-colors shadow-2xs shrink-0"
                                        title="Delete User"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : (
                                      <div 
                                        className="h-7 w-7 flex items-center justify-center rounded-md border border-dashed border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40 shrink-0"
                                        title={p.username === 'admin' ? "System admin account cannot be deleted" : "You cannot delete your own account"}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>)}

        {/* Email Template Tab */}
        {activeTab === "email" && (
          <div className="h-full overflow-y-auto pb-8 pr-2">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600" /> Gate Pass Email Template
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Customize the subject line and body format used when opening Outlook Classic / system email for gate pass dispatch advice.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleTestEmailInOutlook}
                    className="h-8 text-xs border-blue-200 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    title="Open Outlook with sample gate pass data"
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5 text-blue-600" /> Test in Outlook
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleResetEmailTemplate}
                    className="h-8 text-xs text-slate-600 dark:text-slate-300"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Default
                  </Button>
                </div>
              </div>

              <CardContent className="p-6 space-y-6">
                {/* Subject Field */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Email Subject Template
                  </Label>
                  <Input 
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="bg-white dark:bg-slate-900 h-10 w-full font-mono text-xs"
                    placeholder="Gate Pass Dispatch Advice - {gate_pass_no} - {customer_name}"
                  />
                </div>

                {/* Body Field */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Email Body Template
                  </Label>
                  <textarea 
                    rows={12}
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                    placeholder="Enter email body template with dynamic placeholders..."
                  />
                </div>

                {/* Available Placeholders Badges */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Available Dynamic Placeholders (Click to Copy):
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Will be auto-replaced with gate pass record values</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { code: "{gate_pass_no}", desc: "Gate Pass #" },
                      { code: "{customer_name}", desc: "Customer" },
                      { code: "{date}", desc: "Date" },
                      { code: "{time}", desc: "Time Slot" },
                      { code: "{location}", desc: "Location" },
                      { code: "{vehicle_number}", desc: "Vehicle #" },
                      { code: "{driver_name}", desc: "Driver" },
                      { code: "{phone_number}", desc: "Driver Phone" },
                      { code: "{nic}", desc: "Driver NIC" },
                      { code: "{total_cartons}", desc: "Cartons" },
                      { code: "{total_mtrs}", desc: "Meters" },
                      { code: "{total_value}", desc: "Value ($)" },
                      { code: "{invoice_count}", desc: "Invoices #" }
                    ].map(p => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(p.code);
                          toast.success(`Copied placeholder ${p.code}`);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 text-[11px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                        title={`Click to copy: ${p.desc}`}
                      >
                        <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                        <span>{p.code}</span>
                        <span className="text-slate-400 dark:text-slate-500 font-sans text-[10px]">({p.desc})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Live Preview (Sample Dispatch Advice):
                  </Label>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-2 text-xs font-mono">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">
                      Subject: {emailSubject
                        .replace(/{gate_pass_no}/g, "STR2GP-26-JAN-0001")
                        .replace(/{customer_name}/g, "Brandix Apparel Solutions")
                        .replace(/{date}/g, format(new Date(), "yyyy-MM-dd"))
                        .replace(/{time}/g, "08:00 AM - 10:00 AM")
                        .replace(/{location}/g, "Colombo Logistics Center")
                        .replace(/{vehicle_number}/g, "WP-CAB-1234")
                        .replace(/{driver_name}/g, "Kamal Perera")
                        .replace(/{total_cartons}/g, "45")
                      }
                    </div>
                    <pre className="whitespace-pre-wrap text-slate-600 dark:text-slate-400 leading-relaxed font-mono text-[11px]">
                      {emailBody
                        .replace(/{gate_pass_no}/g, "STR2GP-26-JAN-0001")
                        .replace(/{customer_name}/g, "Brandix Apparel Solutions")
                        .replace(/{date}/g, format(new Date(), "yyyy-MM-dd"))
                        .replace(/{time}/g, "08:00 AM - 10:00 AM")
                        .replace(/{location}/g, "Colombo Logistics Center")
                        .replace(/{vehicle_number}/g, "WP-CAB-1234")
                        .replace(/{driver_name}/g, "Kamal Perera")
                        .replace(/{phone_number}/g, "0771234567")
                        .replace(/{nic}/g, "851234567V")
                        .replace(/{total_cartons}/g, "45")
                        .replace(/{total_mtrs}/g, "1250")
                        .replace(/{total_value}/g, "3840.50")
                        .replace(/{invoice_count}/g, "3")
                      }
                    </pre>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 p-4">
                <Button 
                  onClick={handleSaveEmailTemplate} 
                  className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  <Save className="mr-2 h-4 w-4" /> Save Email Template
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Activity & Audit Logs */}
        {activeTab === "logs" && (
          <div className="flex flex-col h-full overflow-hidden">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
              {/* Header & Controls */}
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col md:flex-row gap-2 justify-between items-start md:items-center">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    Activity & Audit Trail
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Real-time audit log of gate pass dispatches, postings, reversals, uploads, and user actions.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <Badge variant="secondary" className="px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
                    {filteredLogs.length} Events
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs"
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                  >
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadingLogs ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs"
                    onClick={handleExportLogsExcel}
                    disabled={filteredLogs.length === 0}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> Export Excel
                  </Button>
                </div>
              </div>

              {/* Filters toolbar */}
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 shrink-0 flex flex-wrap gap-2 items-center">
                {/* Search input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    value={logSearch} 
                    onChange={e => { setLogSearch(e.target.value); setLogCurrentPage(1); }}
                    placeholder="Search by Gate Pass #, User, Action, Reason..."
                    className="h-8 pl-8 text-xs bg-white dark:bg-slate-950"
                  />
                  {logSearch && (
                    <button 
                      onClick={() => { setLogSearch(""); setLogCurrentPage(1); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Action filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Action:</span>
                  <select
                    value={logActionFilter}
                    onChange={e => { setLogActionFilter(e.target.value); setLogCurrentPage(1); }}
                    className="h-8 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-2 text-xs"
                  >
                    <option value="all">All Activities</option>
                    <option value="reversals">Reversals & Rollbacks</option>
                    <option value="GATE_PASS_UNPOSTED">Gate Pass Unposted</option>
                    <option value="GATE_PASS_UNDISPATCHED">Revert to Pending</option>
                    <option value="GATE_PASS_POSTED">Gate Pass Posted</option>
                    <option value="GATE_PASS_DISPATCHED">Gate Pass Dispatched</option>
                    <option value="GATE_PASS_DELETED">Gate Pass Deleted</option>
                    <option value="GATE_PASS_CREATED">Gate Pass Created</option>
                    <option value="DATA_UPLOADED">Master Data Uploaded</option>
                    <option value="users">User Management</option>
                    <option value="USER_LOGIN">User Logins</option>
                  </select>
                </div>

                {/* Date filter */}
                <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Date:</span>
                  <select
                    value={logDateFilter}
                    onChange={e => { setLogDateFilter(e.target.value); setLogCurrentPage(1); }}
                    className="h-8 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-2 text-xs"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="this-week">This Week</option>
                    <option value="this-month">This Month</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>

                {logDateFilter === 'custom' && (
                  <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                    <Input 
                      type="date" 
                      value={logCustomStartDate} 
                      onChange={e => { setLogCustomStartDate(e.target.value); setLogCurrentPage(1); }}
                      className="h-8 text-xs bg-white dark:bg-slate-950 w-32"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input 
                      type="date" 
                      value={logCustomEndDate} 
                      onChange={e => { setLogCustomEndDate(e.target.value); setLogCurrentPage(1); }}
                      className="h-8 text-xs bg-white dark:bg-slate-950 w-32"
                    />
                  </div>
                )}
              </div>

              {/* Table Body */}
              <CardContent className="p-0 flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="flex-1 w-full overflow-auto relative">
                  <Table className="min-w-[900px]">
                    <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-xs border-b border-slate-200 dark:border-slate-700">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-40 font-semibold text-slate-700 dark:text-slate-200 text-xs">Date & Time</TableHead>
                        <TableHead className="w-32 font-semibold text-slate-700 dark:text-slate-200 text-xs">Performed By</TableHead>
                        <TableHead className="w-44 font-semibold text-slate-700 dark:text-slate-200 text-xs">Action</TableHead>
                        <TableHead className="w-40 font-semibold text-slate-700 dark:text-slate-200 text-xs">Target / Ref</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200 text-xs">Event Details & Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingLogs ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                            <div className="flex flex-col items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin mb-2" />
                              Loading activity logs...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : paginatedLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center text-muted-foreground text-sm font-medium">
                            No activity log entries found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedLogs.map((log) => {
                          const details = log.details || {};
                          const reason = details.reason;
                          return (
                            <TableRow key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 text-xs">
                              <TableCell className="font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {log.created_at ? format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss') : '-'}
                              </TableCell>
                              <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono">
                                  {log.performed_by || 'System'}
                                </span>
                              </TableCell>
                              <TableCell>
                                {log.action === 'GATE_PASS_POSTED' && <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">Posted</Badge>}
                                {log.action === 'GATE_PASS_DISPATCHED' && <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px]">Dispatched</Badge>}
                                {log.action === 'GATE_PASS_UNPOSTED' && <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-[10px]">Unposted (Reversed)</Badge>}
                                {log.action === 'GATE_PASS_UNDISPATCHED' && <Badge className="bg-orange-600 hover:bg-orange-700 text-white text-[10px]">Revert to Pending</Badge>}
                                {log.action === 'GATE_PASS_DELETED' && <Badge className="bg-red-600 hover:bg-red-700 text-white text-[10px]">Gate Pass Deleted</Badge>}
                                {log.action === 'GATE_PASS_CREATED' && <Badge className="bg-cyan-600 hover:bg-cyan-700 text-white text-[10px]">Created</Badge>}
                                {log.action === 'DATA_UPLOADED' && <Badge className="bg-teal-600 hover:bg-teal-700 text-white text-[10px]">Data Upload</Badge>}
                                {log.action === 'USER_LOGIN' && <Badge variant="outline" className="text-slate-600 border-slate-300 text-[10px]">Login</Badge>}
                                {log.action === 'USER_CREATED' && <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[10px]">User Created</Badge>}
                                {log.action === 'USER_PASSWORD_RESET' && <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">Password Reset</Badge>}
                                {log.action === 'USER_DELETED' && <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-[10px]">User Deleted</Badge>}
                                {!['GATE_PASS_POSTED', 'GATE_PASS_DISPATCHED', 'GATE_PASS_UNPOSTED', 'GATE_PASS_UNDISPATCHED', 'GATE_PASS_DELETED', 'GATE_PASS_CREATED', 'DATA_UPLOADED', 'USER_LOGIN', 'USER_CREATED', 'USER_PASSWORD_RESET', 'USER_DELETED'].includes(log.action) && (
                                  <Badge variant="secondary" className="text-[10px]">{log.action}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-700 dark:text-slate-300">
                                {log.entity_id || '-'}
                              </TableCell>
                              <TableCell className="text-slate-600 dark:text-slate-400">
                                <div className="space-y-0.5">
                                  {reason && (
                                    <div className="text-amber-700 dark:text-amber-400 font-medium">
                                      <span className="font-semibold">Reason:</span> {reason}
                                    </div>
                                  )}
                                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                                    {details.customer && <span>Customer: <strong>{details.customer}</strong></span>}
                                    {details.vehicle_number && <span>Vehicle: <strong>{details.vehicle_number}</strong></span>}
                                    {details.driver_name && <span>Driver: <strong>{details.driver_name}</strong></span>}
                                    {details.total_cartons !== undefined && <span>Cartons: <strong>{details.total_cartons}</strong></span>}
                                    {details.rows_count !== undefined && <span>Rows: <strong>{details.rows_count}</strong></span>}
                                    {details.file_name && <span>File: <strong>{details.file_name}</strong></span>}
                                    {details.role && <span>Role: <strong>{details.role}</strong></span>}
                                    {details.previous_status && details.new_status && (
                                      <span>Flow: {details.previous_status} → {details.new_status}</span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer matching InvoiceRecords.tsx pagination */}
                {filteredLogs.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/90 dark:bg-slate-900/40 rounded-b-md border-t border-slate-200 dark:border-slate-800 text-[11px] text-muted-foreground shrink-0 shadow-xs mb-0">
                    <div>
                      Showing <span className="font-semibold text-foreground">{(logCurrentPage - 1) * logPageSize + 1}</span> to{" "}
                      <span className="font-semibold text-foreground">{Math.min(logCurrentPage * logPageSize, filteredLogs.length)}</span> of{" "}
                      <span className="font-semibold text-foreground">{filteredLogs.length}</span> activity logs
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLogCurrentPage(1)}
                        disabled={logCurrentPage === 1}
                        title="First Page"
                      >
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLogCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={logCurrentPage === 1}
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>

                      <span className="px-2 py-0.5 font-medium text-foreground">
                        Page {logCurrentPage} of {totalLogPages}
                      </span>

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLogCurrentPage(prev => Math.min(totalLogPages, prev + 1))}
                        disabled={logCurrentPage === totalLogPages}
                        title="Next Page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLogCurrentPage(totalLogPages)}
                        disabled={logCurrentPage === totalLogPages}
                        title="Last Page"
                      >
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* System Backup */}
        {activeTab === "backup" && (<div className="h-full overflow-y-auto pb-8 pr-2">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <CardTitle className="text-base font-semibold">System Backup</CardTitle>
              <CardDescription className="text-xs mt-0.5">Download a complete structured backup of all system data.</CardDescription>
            </div>
            <CardContent className="p-6 space-y-6 flex flex-col items-center text-center justify-center py-12">
              <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-2">
                <Download className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Export All Data to Multi-Sheet Excel</h3>
                <p className="text-sm text-slate-500 max-w-md">
                  Generates an Excel workbook containing dedicated sheets and structured tables for Gate Pass Items, Gate Pass Summary, Drivers Registry, Delivery Locations, Time Slots, Organization Info, and System Users.
                </p>
              </div>
              <Button onClick={handleBackupData} size="lg" className="mt-4 shadow-sm bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                <Download className="h-4 w-4 mr-2" />
                Download System Backup (.xlsx)
              </Button>
            </CardContent>
          </Card>
        </div>)}

        </div>
      </div>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteConfirm?.type}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Modal */}
      <Dialog open={isAddUserOpen} onOpenChange={(open) => !open && !isAddingUser && setIsAddUserOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" /> Create System User
            </DialogTitle>
            <DialogDescription>
              Add a new login account with specific access privileges.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Username *</Label>
              <Input 
                value={newUsername}
                onChange={e => setNewUsername(e.target.value.replace(/\s/g, ''))}
                placeholder="e.g. john_doe"
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">Spaces are automatically removed</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email Address (Optional)</Label>
              <Input 
                type="email"
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                placeholder="e.g. john@example.com"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Initial Password *</Label>
              <div className="relative">
                <Input 
                  type={showAddUserPassword ? "text" : "password"}
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="h-9 text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAddUserPassword(!showAddUserPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showAddUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Account Role *</Label>
              <select
                value={newUserRole}
                onChange={e => setNewUserRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <option value="user">User (Standard Operations)</option>
                <option value="viewer">Viewer (Read-only Records)</option>
                <option value="admin">Admin (System Administrator)</option>
                {isSuperAdmin && (
                  <option value="super_admin">Super Admin (Unrestricted Full Access)</option>
                )}
              </select>
              {!isSuperAdmin && (
                <span className="text-[10px] text-slate-500">Note: Only Super Admins can assign the Super Admin role.</span>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={isAddingUser}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={isAddingUser} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
              {isAddingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Modal */}
      <Dialog open={!!editRoleUser} onOpenChange={(open) => !open && !isUpdatingRole && setEditRoleUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-indigo-600" /> Edit User Role
            </DialogTitle>
            <DialogDescription>
              Update system permission role for account <strong className="text-foreground">{editRoleUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-md border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div><strong>Username:</strong> {editRoleUser?.username}</div>
              <div><strong>Current Role:</strong> <span className="capitalize">{editRoleUser?.role}</span></div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select New Role</Label>
              <select
                value={selectedEditRole}
                onChange={e => setSelectedEditRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                <option value="user">User (Standard Operations)</option>
                <option value="viewer">Viewer (Read-only Records)</option>
                <option value="admin">Admin (System Administrator)</option>
                {isSuperAdmin && (
                  <option value="super_admin">Super Admin (Unrestricted Full Access)</option>
                )}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleUser(null)} disabled={isUpdatingRole}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRole} disabled={isUpdatingRole} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isUpdatingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => !open && !isResettingPassword && setResetPasswordUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <KeyRound className="h-5 w-5" /> Reset User Password
            </DialogTitle>
            <DialogDescription>
              Set a new custom password for account <strong className="text-foreground">{resetPasswordUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">New Password *</Label>
                <button
                  type="button"
                  onClick={() => setNewResetPassword("Pass#" + Math.floor(1000 + Math.random() * 9000) + "!")}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Generate Strong
                </button>
              </div>
              <div className="relative">
                <Input 
                  type={showResetPassword ? "text" : "password"}
                  value={newResetPassword}
                  onChange={e => setNewResetPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="h-9 text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">Minimum 6 characters</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7 w-full text-slate-600"
                onClick={() => setNewResetPassword("password123")}
              >
                Use Default: password123
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordUser(null)} disabled={isResettingPassword}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmResetPassword} 
              disabled={isResettingPassword || newResetPassword.length < 6}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isResettingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
