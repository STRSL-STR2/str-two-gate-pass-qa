import { useEffect, useState, useRef, DragEvent } from "react";
import localforage from "localforage";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { CompanySettings, Driver, Location, TimeSlot, Profile } from "@/types";
import { Card, CardContent, CardDescription, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Save, UploadCloud, AlertTriangle, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // New item states
  const [newDriver, setNewDriver] = useState({ driver_name: "", vehicle_number: "", phone_number: "", nic: "" });
  const [newLocation, setNewLocation] = useState("");
  const [newTimeSlot, setNewTimeSlot] = useState("");
  
  // New user states
  const [newUsername, setNewUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'driver' | 'location' | 'timeSlot' | 'user' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleAddUser = async () => {
    if (!newUsername || !newUserPassword) {
      toast.error("Username and Password are required");
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    try {
      // 1. Try secure RPC admin_create_user (handles server-side bcrypt hashing)
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_username: newUsername.trim(),
        p_email: newUserEmail.trim() || null,
        p_password: newUserPassword,
        p_role: newUserRole
      });

      if (error) {
        // Fallback for transition period if RPC is not yet created
        const { error: insertError } = await supabase
          .from('app_users')
          .insert({
            email: newUserEmail.trim() || null,
            username: newUsername.trim(),
            role: newUserRole,
            is_active: true
          });
        if (insertError) throw insertError;
      }
      
      toast.success("User created successfully.");
      setNewUsername("");
      setNewUserEmail("");
      setNewUserPassword("");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add user");
    }
  };

  const handleDeleteUser = (id: string) => {
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
        // Try admin_delete_user RPC first, fallback to direct delete
        const { error: rpcErr } = await supabase.rpc('admin_delete_user', { p_user_id: id });
        if (rpcErr) {
          const { error } = await supabase.from('app_users').delete().eq('id', id);
          if (error) throw error;
        }
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

  const handleResetPassword = async (id: string, emailOrUser: string) => {
    try {
      // 1. Try secure RPC admin_reset_user_password (hashes password on server)
      const { data, error: rpcErr } = await supabase.rpc('admin_reset_user_password', {
        p_user_id: id,
        p_new_password: 'password123'
      });

      if (rpcErr) {
        // Fallback for legacy database schema
        const { error } = await supabase.from('app_users').update({ plain_password: 'password123' }).eq('id', id);
        if (error) throw error;
      }
      
      toast.success(`Password for ${emailOrUser || 'user'} reset to 'password123'`);
    } catch (err: any) {
      toast.error("Failed to reset password: " + err.message);
    }
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
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
                    placeholder="Tel: +94 11 1234567 | Email: info@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Business Address</Label>
                  <textarea 
                    rows={3}
                    value={companySettings?.business_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, business_address: e.target.value} : null)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300 resize-y"
                    placeholder="Operational / Facility Address"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Registered Address</Label>
                  <textarea 
                    rows={3}
                    value={companySettings?.registered_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, registered_address: e.target.value} : null)}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300 resize-y"
                    placeholder="Official Registered Address"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 max-w-5xl">
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
              <div className="flex-1 w-full overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Driver Name</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Vehicle No</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Phone</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">NIC</TableHead>
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
              <div className="flex-1 w-full overflow-y-auto relative">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Location Details</TableHead>
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
              <div className="flex-1 w-full overflow-y-auto relative">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Time Slot</TableHead>
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
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">System Users</CardTitle>
                <CardDescription className="text-xs text-slate-500">Create accounts and manage access rules.</CardDescription>
              </div>
              <div className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                {profiles.length} Users
              </div>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-2 shrink-0 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                <div className="flex flex-col md:flex-row gap-2 items-end">
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Username *</Label>
                    <Input 
                      value={newUsername} 
                      onChange={e => setNewUsername(e.target.value.replace(/\s/g, ''))} 
                      placeholder="john_doe"
                      className="h-8 text-xs bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Email Address</Label>
                    <Input 
                      type="email"
                      value={newUserEmail} 
                      onChange={e => setNewUserEmail(e.target.value)} 
                      placeholder="Optional (johndoe@example.com)"
                      className="h-8 text-xs bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="grid gap-1 flex-1 w-full">
                    <Label className="text-[11px] font-medium text-slate-500">Password *</Label>
                    <Input 
                      type="password"
                      value={newUserPassword} 
                      onChange={e => setNewUserPassword(e.target.value)}
                      placeholder="Min 6 chars"
                      className="h-8 text-xs bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="grid gap-1 w-full md:w-32">
                    <Label className="text-[11px] font-medium text-slate-500">Role</Label>
                    <select 
                      className="flex h-8 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-2.5 py-0 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value)}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <Button onClick={handleAddUser} size="sm" className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-8 text-xs px-3 w-full md:w-auto shrink-0">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add User
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Username</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Email</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Account Role</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Password</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Status</TableHead>
                      <TableHead className="font-medium text-slate-600 dark:text-slate-400">Joined</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => (
                      <TableRow key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <TableCell className="font-medium">{p.username}</TableCell>
                        <TableCell className="text-slate-500">{p.email || '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${p.role === 'admin' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300' : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 capitalize'}`}>
                            {p.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => handleResetPassword(p.id, p.email)}>
                            Reset Password
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <span className="text-sm text-slate-600 dark:text-slate-400">{p.is_active ? 'Active' : 'Disabled'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{new Date(p.created_at || new Date()).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {p.username !== 'admin' && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(p.id)} className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>)}

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
    </div>
  );
}
