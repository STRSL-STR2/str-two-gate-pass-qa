import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MasterDataRow, CompanySettings, Driver, Location, TimeSlot } from "@/types";
import { supabase } from "@/lib/supabase";
import { logAuditActivity } from "@/lib/audit";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, Save, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";

export default function CreateGatePass() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  
  const selectedRows: MasterDataRow[] = state?.selectedRows || [];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gpNumber, setGpNumber] = useState("STR2GP-0001");
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  
  // Lookups
  const [locations, setLocations] = useState<Location[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  // Form State
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [timeSlot, setTimeSlot] = useState("");
  const [locationName, setLocationName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  
  // Row State for Cartons
  const [rowInputs, setRowInputs] = useState<Record<string, { cartons: string }>>({});
  
  // Confirmation State
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedDriver = drivers.find(d => d.vehicle_number === vehicleNo);

  useEffect(() => {
    // Load signature
    const savedSig = localStorage.getItem('gate_pass_signature');
    if (savedSig) {
      setSignature(savedSig);
    } else {
      setSignature("");
    }

    if (selectedRows.length === 0) {
      toast.error("No invoices selected. Redirecting to Master Data.");
      navigate("/master-data");
      return;
    }

    if (selectedRows.length > 100) {
      toast.error("Maximum 100 rows allowed per gate pass. Please select fewer invoices.");
      navigate("/master-data");
      return;
    }

    const initData = async () => {
      try {
        const [
          { data: locs },
          { data: drvs },
          { data: times },
          { data: sets },
          { count: gpCount, error: countErr }
        ] = await Promise.all([
          supabase.from("delivery_locations").select("*").eq("is_active", true),
          supabase.from("drivers").select("*"),
          supabase.from("time_slots").select("*").eq("is_active", true),
          supabase.from("company_settings").select("*").limit(1).single(),
          supabase.from("gate_pass_records").select("id", { count: 'exact', head: true })
        ]);

        if (locs) setLocations(locs);
        if (drvs) setDrivers(drvs);
        if (times) setTimeSlots(times);
        if (sets) {
          setCompanySettings(sets);
          if (sets.signature_url) {
            setSignature(sets.signature_url);
          }
        }
        
        let finalGpNumber = "STR2GP-0001";
        try {
          // Sort alphabetically desc to grab highest prefix suffix
          const { data: alphabeticalData, error: alphaErr } = await supabase
            .from("gate_pass_records")
            .select("gate_pass_no")
            .order("gate_pass_no", { ascending: false })
            .limit(1);

          let maxNum = 0;
          if (!alphaErr && alphabeticalData && alphabeticalData.length > 0) {
            const match = alphabeticalData[0].gate_pass_no.match(/STR2GP-(\d+)/);
            if (match) {
              maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
          }

          // Double check sorting by ID desc
          const { data: latestData, error: latestErr } = await supabase
            .from("gate_pass_records")
            .select("gate_pass_no")
            .order("id", { ascending: false })
            .limit(1);

          if (!latestErr && latestData && latestData.length > 0) {
            const match = latestData[0].gate_pass_no.match(/STR2GP-(\d+)/);
            if (match) {
              maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
          }

          if (maxNum > 0) {
            finalGpNumber = `STR2GP-${(maxNum + 1).toString().padStart(4, "0")}`;
          } else if (!countErr && gpCount !== null) {
            finalGpNumber = `STR2GP-${(gpCount + 1).toString().padStart(4, "0")}`;
          }
        } catch (e) {
          console.error("Error finding maximum gate pass suffix:", e);
        }

        setGpNumber(finalGpNumber);
      } catch (err) {
        console.error("Error loading gate pass prereqs", err);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  const totalMtrs = selectedRows.reduce((sum, r) => sum + Number(r.qty_invoiced), 0);
  const totalValue = selectedRows.reduce((sum, r) => sum + Number(r.extended_price), 0);
  const totalCartons = (Object.values(rowInputs) as {cartons: string}[]).reduce((sum, val) => sum + (Number(val.cartons) || 0), 0);

  const handleCreate = async () => {
    // Validate
    if (!timeSlot || !locationName || !vehicleNo) {
      toast.error("Please fill in Time, Location, and Vehicle Number.");
      return;
    }

    const hasZeroCartons = selectedRows.some(row => {
      const cartonsCount = Number(rowInputs[row.invoice]?.cartons || 0);
      return cartonsCount === 0;
    });

    if (hasZeroCartons) {
      toast.error("Cannot save: One or more invoices have a carton count of 0. Please enter the carton count.");
      return;
    }

    setSaving(true);
    // Double check with database using fast RPC function
    try {
      const invoiceList = selectedRows.map(r => String(r.invoice).trim()).filter(Boolean);
      const { data: duplicateData, error: rpcErr } = await supabase.rpc('check_duplicate_invoices', {
        target_invoices: invoiceList
      });

      if (!rpcErr && duplicateData && duplicateData.length > 0) {
        const dup = duplicateData[0];
        toast.error(`Validation Failed: Invoice ${dup.invoice} already exists in saved database records under Gate Pass [${dup.gate_pass_no}]. Cannot create gate pass.`);
        setSaving(false);
        return;
      }

      // Fallback check if RPC fails for any reason
      if (rpcErr) {
        const { data: gpRecords, error } = await supabase
          .from('gate_pass_records')
          .select('gate_pass_no, rows');
          
        if (!error && gpRecords) {
          let existingGpNo = null;
          let existingInvoice = null;
          
          outer: for (const gp of gpRecords) {
            const rows = gp.rows as any[];
            for (const row of rows) {
              if (selectedRows.some(sr => sr.invoice === row.invoice)) {
                existingGpNo = gp.gate_pass_no;
                existingInvoice = row.invoice;
                break outer;
              }
            }
          }

          if (existingGpNo) {
            toast.error(`Validation Failed: Invoice ${existingInvoice} already exists in saved database records under Gate Pass [${existingGpNo}]. Cannot create gate pass.`);
            setSaving(false);
            return;
          }
        }
      }
    } catch (e) {
      console.error("Duplicate validation check failed", e);
    }
    setSaving(false);

    setShowConfirm(true);
  };

  const saveGatePass = async () => {
    setShowConfirm(false);
    setSaving(true);
    
    let attempt = 0;
    const maxAttempts = 5;
    
    while (attempt < maxAttempts) {
      try {
        let currentGpNo = gpNumber;
        
        // Attempt to get the next gate pass number atomically via RPC
        const { data: rpcGpNo, error: rpcError } = await supabase.rpc('get_next_gate_pass_number');
        if (!rpcError && rpcGpNo) {
          currentGpNo = rpcGpNo;
        } else if (attempt > 0) {
          // Fallback to client-side max+1 calculation if RPC doesn't exist or fails
          let maxNum = 0;
          const { data: alphabeticalData } = await supabase
            .from("gate_pass_records")
            .select("gate_pass_no")
            .order("gate_pass_no", { ascending: false })
            .limit(1);

          if (alphabeticalData && alphabeticalData.length > 0) {
            const match = alphabeticalData[0].gate_pass_no.match(/STR2GP-(\d+)/);
            if (match) {
              maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
          }

          const { data: latestData } = await supabase
            .from("gate_pass_records")
            .select("gate_pass_no")
            .order("id", { ascending: false })
            .limit(1);

          if (latestData && latestData.length > 0) {
            const match = latestData[0].gate_pass_no.match(/STR2GP-(\d+)/);
            if (match) {
              maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
          }

          const nextId = maxNum + 1;
          currentGpNo = `STR2GP-${nextId.toString().padStart(4, "0")}`;
          setGpNumber(currentGpNo);
        }

        const gRows = selectedRows.map(r => ({
          ...r,
          invoice: r.invoice,
          mtrs: r.qty_invoiced,
          value: r.extended_price,
          buyer: r.ship_via_description,
          po: r.cust_po || "",
          do: r.do_bol,
          cartons: Number(rowInputs[r.invoice]?.cartons || 0)
        }));

        const record = {
          gate_pass_no: currentGpNo,
          date: date,
          time: timeSlot,
          location: locationName,
          vehicle_number: vehicleNo,
          driver_name: selectedDriver?.driver_name || "",
          phone_number: selectedDriver?.phone_number || "",
          nic: selectedDriver?.nic || "",
          customer_name: selectedRows[0]?.name || "",
          created_by: profile?.username || "Unknown",
          rows: gRows,
          total_mtrs: totalMtrs,
          total_value: totalValue,
          total_cartons: totalCartons,
          invoice_count: selectedRows.length,
          status: 'issued'
        };

        const { error } = await supabase.from("gate_pass_records").insert([record]);
        if (error) {
          // If unique constraint violated, retry with the next incremented number
          if ((error.code === "23505" || error.message?.includes("unique constraint") || error.message?.includes("duplicate key")) && attempt < maxAttempts - 1) {
            console.warn(`Unique constraint violation on ${currentGpNo}, retrying next incremental number...`);
            attempt++;
            continue;
          }
          throw error;
        }

        await logAuditActivity({
          action: 'GATE_PASS_CREATED',
          entity_type: 'gate_pass',
          entity_id: currentGpNo,
          details: {
            customer: selectedRows[0]?.name || "",
            vehicle_number: vehicleNo,
            driver_name: selectedDriver?.driver_name || "",
            location: locationName,
            time_slot: timeSlot,
            total_cartons: totalCartons,
            total_mtrs: totalMtrs,
            total_value: totalValue,
            invoice_count: selectedRows.length,
            invoices: selectedRows.map(r => r.invoice)
          },
          performed_by: profile?.username || "Unknown"
        });

        toast.success(`Gate pass ${currentGpNo} created successfully!`);
        navigate(`/gate-pass/records`);
        return;

      } catch (err: any) {
        if (attempt >= maxAttempts - 1) {
          console.error(err);
          toast.error(`Error saving gate pass: ${err.message}`);
          break;
        }
        attempt++;
      }
    }
    
    setSaving(false);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Gate_Pass-${gpNumber}`,
    suppressErrors: true,
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const companyLogo = companySettings?.logo_url || localStorage.getItem('gate_pass_logo');

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto pb-6 space-y-6 max-w-[1000px] mx-auto w-full">
      <div className="flex justify-end items-center no-print mb-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/master-data")}>Cancel</Button>
          <Button variant="secondary" onClick={() => handlePrint()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Gate Pass
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto p-2 sm:p-4 bg-gray-50/50 rounded-md border">
        <div className="bg-white p-8 text-black gate-pass-container shadow-sm mx-auto min-w-[800px] max-w-[900px]" ref={printRef}>
          
          {/* Print Header */}
        <div className="text-center mb-6">
          {companyLogo && (
            <div className="flex justify-center mb-4">
              <img src={companyLogo} alt="Company Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          <h2 className="text-2xl font-bold uppercase">{companySettings?.company_name || 'Stretchline (Private) Limited - Mount Lavinia'}</h2>
          <p className="text-sm">{companySettings?.business_address}</p>
          {companySettings?.registered_address && <p className="text-sm">{companySettings.registered_address}</p>}
          <p className="text-sm">{companySettings?.contact_line}</p>
          <div className="mt-4 py-2 border-y-2 border-black font-bold text-lg text-center tracking-widest">
            CONTROLLED BY COMMERCIAL & LOGISTICS DEPARTMENT
          </div>
          <h3 className="mt-4 text-xl font-bold uppercase underline">GATE PASS</h3>
        </div>

        {/* Form Details Grid */}
        <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-6">
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Gate Pass No :</Label>
            <div className="font-bold">{gpNumber}</div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Vehicle No :</Label>
            <Select value={vehicleNo} onValueChange={setVehicleNo}>
              <SelectTrigger className="h-8 border-gray-300">
                <SelectValue placeholder="Select Vehicle" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.vehicle_number}>{d.vehicle_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Date :</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 border-gray-300" />
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Driver Name :</Label>
            <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded min-h-[32px]">
              {selectedDriver?.driver_name || ""}
            </div>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Time :</Label>
            <Select value={timeSlot} onValueChange={setTimeSlot}>
              <SelectTrigger className="h-8 border-gray-300">
                <SelectValue placeholder="Select Time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map(t => (
                  <SelectItem key={t.id} value={t.label}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Phone No :</Label>
            <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded min-h-[32px]">
              {selectedDriver?.phone_number || ""}
            </div>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Location :</Label>
            <Select value={locationName} onValueChange={setLocationName}>
              <SelectTrigger className="h-8 border-gray-300">
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map(l => (
                  <SelectItem key={l.id} value={l.location_name}>{l.location_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right">Driver NIC :</Label>
            <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded min-h-[32px]">
              {selectedDriver?.nic || ""}
            </div>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2 min-w-0">
            <Label className="font-semibold text-right whitespace-nowrap">Customer:</Label>
            <div className="truncate" title={selectedRows[0]?.name}>{selectedRows[0]?.name}</div>
          </div>

          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="font-semibold text-right whitespace-nowrap">Seal Number :</Label>
            <div>..............................................</div>
          </div>
        </div>

        {/* Invoice Table */}
        <table className="w-full text-sm border-collapse border border-black mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-2 w-10">NO</th>
              <th className="border border-black p-2">Invoice</th>
              <th className="border border-black p-2">DO</th>
              <th className="border border-black p-2">MTRS</th>
              <th className="border border-black p-2 w-24">CTN</th>
            </tr>
          </thead>
          <tbody>
            {selectedRows.map((row, idx) => (
              <tr key={row.invoice}>
                <td className="border border-black p-2 text-center">{idx + 1}</td>
                <td className="border border-black p-2 font-medium">{row.invoice}</td>
                <td className="border border-black p-2 text-center">{row.do_bol}</td>
                <td className="border border-black p-2 text-right">{(Number(row.qty_invoiced) || 0).toLocaleString()}</td>
                <td className="border border-black p-1">
                  <Input 
                    className="h-7 text-xs border-gray-400 no-print-border text-center" 
                    type="number"
                    value={rowInputs[row.invoice]?.cartons || ""}
                    onChange={e => setRowInputs(prev => ({...prev, [row.invoice]: { ...prev[row.invoice], cartons: e.target.value }}))}
                  />
                  <span className="print-only hidden">{rowInputs[row.invoice]?.cartons || 0}</span>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="border border-black p-2 font-bold text-right">TOTAL</td>
              <td className="border border-black p-2 font-bold text-right">{(Number(totalMtrs) || 0).toLocaleString()}</td>
              <td className="border border-black p-2 font-bold text-center">{totalCartons}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-center font-bold text-lg mb-16 print:break-inside-avoid">
          <div>TOTAL NUMBER OF CARTONS = <span className="border-b border-black inline-block w-16 text-center">{totalCartons}</span></div>
        </div>

        <div className="grid grid-cols-3 gap-8 text-center mt-12 mb-8 animate-fade-in print:break-inside-avoid">
          <div className="flex flex-col items-center justify-end h-24">
            {signature && (
              <img src={signature} alt="Authorized Signature" className="max-h-16 max-w-[150px] object-contain mb-1" referrerPolicy="no-referrer" />
            )}
            <div className="w-full border-t border-black pt-2 px-4 font-semibold">Authorized By</div>
          </div>
          <div className="flex flex-col items-center justify-end h-24">
            <div className="w-full border-t border-black pt-2 px-4 font-semibold">Issued By</div>
          </div>
          <div className="flex flex-col items-center justify-end h-24">
            <div className="w-full border-t border-black pt-2 px-4 font-semibold">Received By</div>
          </div>
        </div>

        <div className="text-xs text-gray-500 mt-12">
          Created by: {profile?.username || 'Unknown'} at {format(new Date(), "dd/MM/yyyy HH:mm:ss")}
        </div>
      </div>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-primary">
              Confirm Save
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Are you sure you want to save this Gate Pass? Please verify that the DO numbers and Carton counts are correct.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={saveGatePass} className="bg-primary hover:bg-primary/90 text-white">
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
