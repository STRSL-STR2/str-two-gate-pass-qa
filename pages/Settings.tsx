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
        supabase.from('app_users').select('*')
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
      toast.info("Generating backup file...");
      
      const wb = XLSX.utils.book_new();

      // 1. Fetch gate pass records
      const { data: gpRecords } = await supabase.from('gate_pass_records').select('*');
      if (gpRecords && gpRecords.length > 0) {
        // Flatten rows array for Excel
        const flatGpData = gpRecords.flatMap(gp => 
          (gp.rows as any[]).map(row => ({
            GatePassNo: gp.gate_pass_no,
            Status: gp.status,
            Date: gp.date,
            TimeSlot: gp.time_slot,
            Location: gp.location,
            VehicleNo: gp.vehicle_number,
            Driver: gp.driver_name,
            Invoice: row.invoice,
            Buyer: row.buyer,
            Qty: row.mtrs,
            Value: row.value,
            Cartons: row.cartons
          }))
        );
        const wsGp = XLSX.utils.json_to_sheet(flatGpData);
        XLSX.utils.book_append_sheet(wb, wsGp, "Gate Passes");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: "No Gate Passes Found" }]), "Gate Passes");
      }

      // 2. Fetch Master Data
      const masterData = await localforage.getItem("masterData");
      if (masterData && Array.isArray(masterData) && masterData.length > 0) {
        const wsMaster = XLSX.utils.json_to_sheet(masterData);
        XLSX.utils.book_append_sheet(wb, wsMaster, "Master Data");
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: "No Master Data Found" }]), "Master Data");
      }
      
      // 3. Settings Data
      const settingsData = [
        { Type: 'Driver', Details: drivers.map(d => `${d.driver_name} - ${d.vehicle_number}`).join(' | ') },
        { Type: 'Location', Details: locations.map(l => l.location_name).join(' | ') },
        { Type: 'Time Slot', Details: timeSlots.map(t => t.time_slot).join(' | ') }
      ];
      const wsSettings = XLSX.utils.json_to_sheet(settingsData);
      XLSX.utils.book_append_sheet(wb, wsSettings, "System Settings");

      // Download
      XLSX.writeFile(wb, `System_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Backup downloaded successfully.");

    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate backup.");
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
    try {
      const { data, error } = await supabase
        .from('app_users')
        .insert({
          email: newUserEmail.trim() || null,
          plain_password: newUserPassword,
          username: newUsername,
          role: newUserRole,
          is_active: true
        })
        .select();

      if (error) throw error;
      
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
        const { error } = await supabase.from('app_users').delete().eq('id', id);
        if (error) throw error;
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

  const handleResetPassword = async (id: string, email: string) => {
    try {
      const { error } = await supabase.from('app_users').update({ plain_password: 'password123' }).eq('id', id);
      if (error) throw error;
      setProfiles(profiles.map(p => p.id === id ? { ...p, plain_password: 'password123' } : p));
      toast.success(`Password for ${email || 'user'} reset to 'password123'`);
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
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <CardTitle className="text-lg">Organization Information</CardTitle>
              <CardDescription className="mt-1">Details configured here will appear on printed gate passes.</CardDescription>
            </div>
            <CardContent className="p-6 space-y-8">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Organization Name</Label>
                  <Input 
                    value={companySettings?.company_name || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, company_name: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Business Address</Label>
                  <Input 
                    value={companySettings?.business_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, business_address: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Registered Address</Label>
                  <Input 
                    value={companySettings?.registered_address || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, registered_address: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Contact Details (Tel/Fax/Email)</Label>
                  <Input 
                    value={companySettings?.contact_line || ""}
                    onChange={e => setCompanySettings(prev => prev ? {...prev, contact_line: e.target.value} : null)}
                    className="bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
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

            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0">

              <CardTitle className="text-lg">Drivers Registry</CardTitle>
              <CardDescription className="mt-1">Manage approved drivers and their primary vehicles.</CardDescription>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="p-6 shrink-0 border-b border-slate-100 dark:border-slate-800"><div className="flex flex-col md:flex-row gap-3 items-end m-0 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Driver Name</Label>
                  <Input className="h-9 bg-white dark:bg-slate-950" value={newDriver.driver_name} onChange={e => setNewDriver({...newDriver, driver_name: e.target.value})} placeholder="John Doe" />
                </div>
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Vehicle No</Label>
                  <Input className="h-9 bg-white dark:bg-slate-950 uppercase" value={newDriver.vehicle_number} onChange={e => setNewDriver({...newDriver, vehicle_number: e.target.value})} placeholder="ABC-1234" />
                </div>
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Phone No</Label>
                  <Input className="h-9 bg-white dark:bg-slate-950" value={newDriver.phone_number} onChange={e => setNewDriver({...newDriver, phone_number: e.target.value})} placeholder="071..." />
                </div>
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">NIC</Label>
                  <Input className="h-9 bg-white dark:bg-slate-950" value={newDriver.nic} onChange={e => setNewDriver({...newDriver, nic: e.target.value})} placeholder="NIC number" />
                </div>
                <Button onClick={handleAddDriver} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-9 w-full md:w-auto mt-2 md:mt-0">
                  <Plus className="mr-2 h-4 w-4" /> Add Driver
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
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col md:flex-row gap-4 justify-between items-center w-full">
              <CardTitle className="text-lg whitespace-nowrap">Delivery Locations</CardTitle>
              <div className="flex items-center gap-3 w-full md:max-w-md">
                <div className="flex-1 w-full relative">
                  <Input className="h-10 bg-white dark:bg-slate-950 w-full" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. MAS Holdings HQ" />
                </div>
                <Button onClick={handleAddLocation} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-10 shrink-0">
                  <Plus className="mr-2 h-4 w-4" /> Add
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
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-col md:flex-row gap-4 justify-between items-center w-full">
              <CardTitle className="text-lg whitespace-nowrap">Delivery Time Slots</CardTitle>
              <div className="flex items-center gap-3 w-full md:max-w-md">
                <div className="flex-1 w-full relative">
                  <Input className="h-10 bg-white dark:bg-slate-950 w-full" value={newTimeSlot} onChange={e => setNewTimeSlot(e.target.value)} placeholder="e.g. 08:00 AM - 10:00 AM" />
                </div>
                <Button onClick={handleAddTimeSlot} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-10 shrink-0">
                  <Plus className="mr-2 h-4 w-4" /> Add
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

            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 shrink-0">

              <CardTitle className="text-lg">System Users</CardTitle>
              <CardDescription className="mt-1">Create accounts and manage access rules.</CardDescription>
            </div>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div className="p-6 shrink-0 border-b border-slate-100 dark:border-slate-800"><div className="flex flex-col md:flex-row gap-4 items-end m-0 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Username *</Label>
                  <Input 
                    value={newUsername} 
                    onChange={e => setNewUsername(e.target.value.replace(/\s/g, ''))} 
                    placeholder="john_doe"
                    className="h-10 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Email Address</Label>
                  <Input 
                    type="email"
                    value={newUserEmail} 
                    onChange={e => setNewUserEmail(e.target.value)} 
                    placeholder="Optional (johndoe@example.com)"
                    className="h-10 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid gap-1.5 flex-1 w-full">
                  <Label className="text-xs text-slate-500">Password *</Label>
                  <Input 
                    type="password"
                    value={newUserPassword} 
                    onChange={e => setNewUserPassword(e.target.value)}
                    placeholder="Minimum 6 chars"
                    className="h-10 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="grid gap-1.5 w-full md:w-40">
                  <Label className="text-xs text-slate-500">Role</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <Button onClick={handleAddUser} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 h-10 w-full md:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> Add User
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
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <CardTitle className="text-lg">System Backup</CardTitle>
              <CardDescription className="mt-1">Download a complete backup of all system data.</CardDescription>
            </div>
            <CardContent className="p-6 space-y-6 flex flex-col items-center text-center justify-center py-12">
              <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-2">
                <Download className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium text-lg">Export All Data to Excel</h3>
                <p className="text-sm text-slate-500 max-w-sm">This will generate an Excel file containing separate sheets for Gate Passes, Master Data (Invoices), and Settings.</p>
              </div>
              <Button onClick={handleBackupData} size="lg" className="mt-4 shadow-sm">
                <Download className="h-4 w-4 mr-2" />
                Download Backup File
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
