import React, { useState, useEffect } from "react";
import localforage from "localforage";
import { MasterDataRow } from "@/types";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { logAuditActivity } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2, Trash2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface FileState {
  fileName?: string;
  file: File | null;
  status: UploadStatus;
  error?: string;
  data: any[];
}

interface SelectiveClearDialogProps {
  invoices: FileState;
  soDetails: FileState;
  rmaDetails: FileState;
  locations: FileState;
  onClear: (categories: Array<"invoices" | "soDetails" | "rmaDetails" | "locations">) => void;
}

function SelectiveClearDialog({
  invoices,
  soDetails,
  rmaDetails,
  locations,
  onClear
}: SelectiveClearDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Array<"invoices" | "soDetails" | "rmaDetails" | "locations">>([]);

  const handleToggle = (category: "invoices" | "soDetails" | "rmaDetails" | "locations") => {
    setSelected(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const hasData = (state: FileState) => state.status === "success" && state.data.length > 0;

  const handleClear = () => {
    if (selected.length === 0) {
      toast.error("Please select at least one category to clear.");
      return;
    }
    onClear(selected);
    setSelected([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <Trash2 className="h-4 w-4 mr-2" />
            Selective Clear...
          </Button>
        }
      />
      <DialogContent className="max-w-md w-full p-6">
        <DialogHeader className="mb-4 flex flex-col gap-1">
          <DialogTitle className="text-lg font-bold">Selective Data Reset</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Choose the specific file categories you would like to clear from the current upload session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Invoice Details */}
          <div 
            onClick={() => handleToggle("invoices")}
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/30",
              selected.includes("invoices") ? "border-amber-300 bg-amber-50/10 dark:border-amber-700 dark:bg-amber-950/10" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selected.includes("invoices")} 
                onCheckedChange={() => handleToggle("invoices")} 
              />
              <div className="text-left">
                <p className="font-semibold text-sm">Invoice Details</p>
                <p className="text-xs text-muted-foreground">Main invoice billing entries</p>
              </div>
            </div>
            <div>
              {hasData(invoices) ? (
                <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50">
                  {invoices.data.length} row(s)
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-800/50 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
                  Empty
                </span>
              )}
            </div>
          </div>

          {/* SO Details */}
          <div 
            onClick={() => handleToggle("soDetails")}
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/30",
              selected.includes("soDetails") ? "border-amber-300 bg-amber-50/10 dark:border-amber-700 dark:bg-amber-950/10" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selected.includes("soDetails")} 
                onCheckedChange={() => handleToggle("soDetails")} 
              />
              <div className="text-left">
                <p className="font-semibold text-sm">SO Details</p>
                <p className="text-xs text-muted-foreground">Sales orders and shipment routes</p>
              </div>
            </div>
            <div>
              {hasData(soDetails) ? (
                <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50">
                  {soDetails.data.length} row(s)
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-800/50 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
                  Empty
                </span>
              )}
            </div>
          </div>

          {/* RMA Details */}
          <div 
            onClick={() => handleToggle("rmaDetails")}
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/30",
              selected.includes("rmaDetails") ? "border-amber-300 bg-amber-50/10 dark:border-amber-700 dark:bg-amber-950/10" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selected.includes("rmaDetails")} 
                onCheckedChange={() => handleToggle("rmaDetails")} 
              />
              <div className="text-left">
                <p className="font-semibold text-sm">RMA Details</p>
                <p className="text-xs text-muted-foreground">Return Merchandise Authorization warnings</p>
              </div>
            </div>
            <div>
              {hasData(rmaDetails) ? (
                <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50">
                  {rmaDetails.data.length} row(s)
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-800/50 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
                  Empty
                </span>
              )}
            </div>
          </div>

          {/* Location Details */}
          <div 
            onClick={() => handleToggle("locations")}
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/30",
              selected.includes("locations") ? "border-amber-300 bg-amber-50/10 dark:border-amber-700 dark:bg-amber-950/10" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selected.includes("locations")} 
                onCheckedChange={() => handleToggle("locations")} 
              />
              <div className="text-left">
                <p className="font-semibold text-sm">Location Details</p>
                <p className="text-xs text-muted-foreground">Consignee shipping addresses</p>
              </div>
            </div>
            <div>
              {hasData(locations) ? (
                <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-950/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-800/50">
                  {locations.data.length} row(s)
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-800/50 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
                  Empty
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex gap-2">
          <DialogClose render={<Button variant="outline" size="sm">Cancel</Button>} />
          <Button 
            disabled={selected.length === 0}
            onClick={handleClear} 
            variant="destructive"
            size="sm"
          >
            Clear Selected ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function DataUpload() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<FileState>({ file: null, status: "idle", data: [] });
  const [soDetails, setSoDetails] = useState<FileState>({ file: null, status: "idle", data: [] });
  const [rmaDetails, setRmaDetails] = useState<FileState>({ file: null, status: "idle", data: [] });
  const [locations, setLocations] = useState<FileState>({ file: null, status: "idle", data: [] });
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const loadSavedFiles = async () => {
      const keys = ["invoices", "soDetails", "rmaDetails", "locations"];
      for (const key of keys) {
        try {
          const saved = await localforage.getItem(`upload_${key}`);
          if (saved && typeof saved === 'object' && (saved as any).fileName && (saved as any).data) {
            const parsed = saved as { fileName: string, data: any[] };
            if (key === "invoices") setInvoices({ file: null, fileName: parsed.fileName, status: "success", data: parsed.data });
            else if (key === "soDetails") setSoDetails({ file: null, fileName: parsed.fileName, status: "success", data: parsed.data });
            else if (key === "rmaDetails") setRmaDetails({ file: null, fileName: parsed.fileName, status: "success", data: parsed.data });
            else if (key === "locations") setLocations({ file: null, fileName: parsed.fileName, status: "success", data: parsed.data });
          }
        } catch (e) {
          console.error(`Failed to load ${key} from IndexedDB:`, e);
        }
      }
    };
    loadSavedFiles();
  }, []);

  
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "invoices" | "soDetails" | "rmaDetails" | "locations",
    setFileState: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls") && !file.name.endsWith(".csv")) {
      toast.error("Invalid file format. Please upload .xlsx, .xls, or .csv files only.");
      return;
    }

    setFileState(prev => ({ ...prev, file, status: "uploading" }));

    try {
      let json: any[] = [];
      
      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        json = await new Promise((resolve, reject) => {
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
            complete: (results) => {
              if (results.errors && results.errors.length > 0) {
                 console.warn("CSV Parsing issues:", results.errors);
              }
              resolve(results.data);
            },
            error: (err) => {
              reject(err);
            }
          });
        });
      } else {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      }

      if (json.length === 0) {
        throw new Error("File is empty or could not be parsed.");
      }

      setFileState({ file, fileName: file.name, status: "success", data: json });
      try { await localforage.setItem(`upload_${type}`, { fileName: file.name, data: json }); } catch (e) { console.error(e); toast.warning("Failed to save to local storage (file too large)."); }
      toast.success(`${file.name} processed successfully.`);
      
    } catch (err: any) {
      console.error(err);
      setFileState(prev => ({ ...prev, status: "error", error: err.message || "Failed to process file." }));
      toast.error(`Error processing ${file.name}: ${err.message}`);
    }
  };

  const handleClearAll = () => {
    localforage.removeItem("upload_invoices");
    localforage.removeItem("upload_soDetails");
    localforage.removeItem("upload_rmaDetails");
    localforage.removeItem("upload_locations");
    setInvoices({ file: null, status: "idle", data: [] });
    setSoDetails({ file: null, status: "idle", data: [] });
    setRmaDetails({ file: null, status: "idle", data: [] });
    setLocations({ file: null, status: "idle", data: [] });
    localforage.removeItem("masterData");
    toast.success("All data cleared successfully.");
  };

  const handleSelectiveClear = (categories: Array<"invoices" | "soDetails" | "rmaDetails" | "locations">) => {
    let clearedNames: string[] = [];
    if (categories.includes("invoices")) {
      setInvoices({ file: null, status: "idle", data: [] });
      localforage.removeItem("upload_invoices");
      clearedNames.push("Invoice Details");
    }
    if (categories.includes("soDetails")) {
      setSoDetails({ file: null, status: "idle", data: [] });
      localforage.removeItem("upload_soDetails");
      clearedNames.push("SO Details");
    }
    if (categories.includes("rmaDetails")) {
      setRmaDetails({ file: null, status: "idle", data: [] });
      localforage.removeItem("upload_rmaDetails");
      clearedNames.push("RMA Details");
    }
    if (categories.includes("locations")) {
      setLocations({ file: null, status: "idle", data: [] });
      localforage.removeItem("upload_locations");
      clearedNames.push("Location Details");
    }
    
    if (clearedNames.length > 0) {
      localforage.removeItem("masterData");
      toast.success(`Cleared: ${clearedNames.join(", ")} successfully.`);
    }
  };

  const handleGenerateMasterData = async () => {
    setIsGenerating(true);
    try {
      const parseNum = (val: any) => {
        if (!val && val !== 0) return 0;
        const str = String(val).replace(/,/g, '').trim();
        const num = Number(str);
        return isNaN(num) ? 0 : num;
      };

      const getVal = (row: any, keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
            return row[k];
          }
           // Check lowercase exact match as fallback
           const lowerKey = k.toLowerCase();
           for (const rowKey of Object.keys(row)) {
             if (rowKey.toLowerCase().trim() === lowerKey) {
                return row[rowKey];
             }
           }
        }
        return "";
      };

      const rawInvoices = invoices.data.map(row => ({
        invoice: String(getVal(row, ["Invoice", "Invoice No"])),
        name: String(getVal(row, ["Name", "Customer Name", "Customer"])),
        invoice_date: String(getVal(row, ["Invoice Date", "Date"])),
        order_no: String(getVal(row, ["Order", "Order No"])),
        line: String(getVal(row, ["Line"])),
        release: String(getVal(row, ["Release"])),
        qty_invoiced: parseNum(getVal(row, ["Qty Invoiced", "Qty Inv", "Quantity", "Qty"])),
        extended_price: parseNum(getVal(row, ["Extended Price", "Price", "Amount"])),
        do_bol: String(getVal(row, ["DO/BOL", "DO", "BOL", "DO Number"])),
        dispatch_date: String(getVal(row, ["Dispatch Date"])),
        cust_po: String(getVal(row, ["Cust PO:", "Cust PO", "PO", "PO Number"]))
      }));

      const rawSO = soDetails.data.map(row => ({
        order_no: String(getVal(row, ["Order", "Order No"])),
        ship_via_description: String(getVal(row, ["Ship Via Description", "Ship Via"]))
      }));

      const rawRMA = rmaDetails.data.map(row => ({
        rma: String(getVal(row, ["RMA", "RMA No", "RMA Number"])),
        original_invoice: String(getVal(row, ["Original Invoice", "Orig Inv"])),
        reason: String(getVal(row, ["Reason"]))
      }));

      const rawLoc = locations.data.map(row => ({
        do_bol: String(getVal(row, ["DO/BOL", "DO", "BOL", "DO Number"])),
        consignee_address_3: String(getVal(row, ["Consignee Address [3]", "Consignee Address", "Address"]))
      }));

      if (rawInvoices.length === 0) throw new Error("No invoice data found.");

      const validInvoices = rawInvoices.filter(inv => !inv.dispatch_date || inv.dispatch_date.trim() === "");

      const soMap = new Map<string, string>(rawSO.map(so => [String(so.order_no), String(so.ship_via_description)]));
      const rmaMap = new Map<string, {rma: string, reason: string}>(rawRMA.map(rma => [String(rma.original_invoice), { rma: String(rma.rma), reason: String(rma.reason) }]));
      const locMap = new Map<string, string>(rawLoc.map(loc => [String(loc.do_bol), String(loc.consignee_address_3)]));

      const masterRows: MasterDataRow[] = validInvoices.map((inv, idx) => {
        const orderNo = inv.order_no;
        const doBol = inv.do_bol;
        const invoiceNo = inv.invoice;

        const shipVia = soMap.get(orderNo) || "";
        const consignee = locMap.get(doBol) || "";
        const rmaData = rmaMap.get(invoiceNo);

        const pendingFields: string[] = [];
        if (!shipVia) pendingFields.push("Ship Via Description");
        if (!consignee) pendingFields.push("Consignee Address [3]");
        
        return {
          id: `local-master-${idx}`,
          invoice: invoiceNo,
          name: inv.name,
          invoice_date: inv.invoice_date,
          order_no: orderNo,
          line: inv.line,
          release: inv.release,
          qty_invoiced: inv.qty_invoiced,
          extended_price: inv.extended_price,
          do_bol: doBol,
          ship_via_description: shipVia,
          consignee_address_3: consignee,
          rma: rmaData?.rma || "",
          reason: rmaData?.reason || "",
          rma_status: !!rmaData,
          pending_fields: pendingFields,
          cust_po: inv.cust_po
        };
      });

      await localforage.setItem("masterData", masterRows);

      await logAuditActivity({
        action: 'DATA_UPLOADED',
        entity_type: 'master_data',
        entity_id: `UPLOAD-${format(new Date(), 'yyyyMMdd-HHmmss')}`,
        details: {
          total_master_records: masterRows.length,
          invoices_count: validInvoices.length,
          so_count: rawSO.length,
          rma_count: rawRMA.length,
          locations_count: rawLoc.length
        },
        performed_by: profile?.username || "Admin"
      });

      toast.success("Master Data generated successfully.");
      navigate("/master-data");
      
    } catch (err: any) {
      console.error(err);
      toast.error(`Error generating master data: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const isAllUploaded = 
    invoices.status === "success" && 
    soDetails.status === "success" && 
    rmaDetails.status === "success" && 
    locations.status === "success";

  const renderUploadCard = (
    title: string,
    state: FileState,
    type: "invoices" | "soDetails" | "rmaDetails" | "locations"
  ) => {
    return (
      <Card className={cn(
        "relative overflow-hidden transition-all duration-200 border-2",
        state.status === "success" ? "border-green-500/50 bg-green-50/10 dark:bg-green-950/20" : 
        state.status === "error" ? "border-red-500/50 bg-red-50/10 dark:bg-red-950/20" : "border-transparent"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              {title}
              {state.status === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {state.status === "error" && <AlertCircle className="h-5 w-5 text-red-500" />}
            </div>
            {state.status === "success" && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 -mr-2"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectiveClear([type]);
                }}
                title="Clear file"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </CardTitle>
          <CardDescription>Upload {title} Excel or CSV files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => handleFileUpload(e, type, 
                type === "invoices" ? setInvoices : 
                type === "soDetails" ? setSoDetails : 
                type === "rmaDetails" ? setRmaDetails : setLocations
              )}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={state.status === "uploading"}
            />
            <div className={cn(
              "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors",
              state.status === "idle" ? "hover:border-primary hover:bg-primary/5" : "bg-muted/50"
            )}>
              {state.status === "uploading" ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
              ) : state.status === "success" ? (
                <FileSpreadsheet className="h-8 w-8 text-green-500 mb-2" />
              ) : (
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
              )}
              
              <span className="text-sm font-medium text-center">
                {state.file ? state.file.name : state.fileName ? state.fileName : "Click or drag file to upload"}
              </span>
            </div>
          </div>
          {state.error && (
            <p className="text-xs text-red-500 mt-2 font-medium">{state.error}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-5xl mx-auto flex-1 overflow-y-auto pb-6 h-full">
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 mt-2">
        <div className="flex-1 text-sm text-muted-foreground px-2">
          Upload all 4 required reports to generate master data
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectiveClearDialog
            invoices={invoices}
            soDetails={soDetails}
            rmaDetails={rmaDetails}
            locations={locations}
            onClear={handleSelectiveClear}
          />
          <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-950" onClick={handleClearAll}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderUploadCard("Invoice Details", invoices, "invoices")}
        {renderUploadCard("SO Details", soDetails, "soDetails")}
        {renderUploadCard("RMA Details", rmaDetails, "rmaDetails")}
        {renderUploadCard("Locations Details", locations, "locations")}
      </div>

      <div className="mt-8 pt-8 border-t flex flex-col items-center">
        <Button 
          size="lg" 
          disabled={!isAllUploaded || isGenerating}
          onClick={handleGenerateMasterData}
          className="w-full max-w-sm font-semibold h-12"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating Master Data...
            </>
          ) : (
            <>
              Generate Master Data
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
        {!isAllUploaded && (
          <p className="text-sm text-muted-foreground mt-4 text-center max-w-lg">
            You must upload all four Excel files successfully before you can generate the master data set.
          </p>
        )}
      </div>
    </div>
  );
}

