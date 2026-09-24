import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { useEffect, useState, useRef, useMemo } from "react";
import { GatePassRecord } from "@/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Printer, Eye, Trash2, Edit, Download, CheckCircle, AlertTriangle, Truck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, isToday, isThisWeek, isThisMonth, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { useReactToPrint } from "react-to-print";
import { CompanySettings } from "@/types";
import * as XLSX from "xlsx";
import { EditGatePassModal } from "@/components/EditGatePassModal";
import { logAuditActivity } from "@/lib/audit";

export default function GatePassRecords() {
  const { profile } = useAuth();
  const [data, setData] = useState<GatePassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof GatePassRecord>("gate_pass_no");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: keyof GatePassRecord) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };
  
  // Date Filter State
  const [dateFilter, setDateFilter] = useState("this-week");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [completedFilter, setCompletedFilter] = useState("all");

  // Pagination State (100 rows limit)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  // View/Print Dialog State
  const [viewingRecord, setViewingRecord] = useState<GatePassRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<GatePassRecord | null>(null);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [actionRecord, setActionRecord] = useState<GatePassRecord | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Delete State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<GatePassRecord | null>(null);

  // Super Admin Reversal States
  const [unpostConfirmOpen, setUnpostConfirmOpen] = useState(false);
  const [undispatchConfirmOpen, setUndispatchConfirmOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  useEffect(() => {
    if (profile && !isAdmin) {
      setCompletedFilter('pending');
    }
  }, [profile, isAdmin]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: records, error }, { data: settings }] = await Promise.all([
        supabase.from('gate_pass_records').select('*').order('created_at', { ascending: false }),
        supabase.from('company_settings').select('*').limit(1).single()
      ]);

      if (error) throw error;
      
      setData(records as GatePassRecord[]);
      if (settings) {
        setCompanySettings(settings);
        if (settings.signature_url) {
          setSignature(settings.signature_url);
        }
      }
    } catch (err: any) {
      toast.error(`Error loading records: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const savedSig = localStorage.getItem('gate_pass_signature');
    if (savedSig) {
      setSignature(savedSig);
    } else {
      setSignature("");
    }
  }, []);

  const handleDelete = async () => {
    if (!recordToDelete) return;

    try {
      const { error } = await supabase.from('gate_pass_records').delete().eq('id', recordToDelete.id);
      if (error) throw error;
      
      await logAuditActivity({
        action: 'GATE_PASS_DELETED',
        entity_type: 'gate_pass',
        entity_id: recordToDelete.gate_pass_no,
        details: {
          status: recordToDelete.status,
          customer: recordToDelete.customer_name,
          vehicle_number: recordToDelete.vehicle_number,
          total_cartons: recordToDelete.total_cartons,
          total_mtrs: recordToDelete.total_mtrs,
          invoice_count: recordToDelete.invoice_count,
          invoices: Array.isArray(recordToDelete.rows) ? recordToDelete.rows.map((r: any) => r.invoice) : []
        },
        performed_by: profile?.username || 'Admin'
      });

      toast.success(`Gate pass ${recordToDelete.gate_pass_no} deleted successfully.`);
      setData(prev => prev.filter(r => r.id !== recordToDelete.id));
    } catch (err: any) {
      toast.error(`Error deleting record: ${err.message}`);
    } finally {
      setDeleteConfirmOpen(false);
      setRecordToDelete(null);
    }
  };

  const handleUpdateStatus = async (status: 'locked' | 'completed' | 'dispatched', recordOverride?: any) => {
    const targetRecord = recordOverride || actionRecord;
    if (!targetRecord) return;
    
    // Validation: Cannot post (complete) if gate pass is not dispatched yet!
    if (status === 'completed' && targetRecord.status !== 'dispatched') {
      toast.error(`Cannot post Gate Pass ${targetRecord.gate_pass_no}! Goods must be dispatched first before posting.`);
      setCompleteConfirmOpen(false);
      return;
    }
    
    try {
      const { error } = await supabase.from('gate_pass_records').update({ status }).eq('id', targetRecord.id);
      if (error) throw error;
      
      if (status === 'dispatched') {
        await logAuditActivity({
          action: 'GATE_PASS_DISPATCHED',
          entity_type: 'gate_pass',
          entity_id: targetRecord.gate_pass_no,
          details: {
            vehicle_number: targetRecord.vehicle_number,
            driver_name: targetRecord.driver_name,
            total_cartons: targetRecord.total_cartons
          },
          performed_by: profile?.username || 'Staff'
        });
      } else if (status === 'completed') {
        await logAuditActivity({
          action: 'GATE_PASS_POSTED',
          entity_type: 'gate_pass',
          entity_id: targetRecord.gate_pass_no,
          details: {
            customer: targetRecord.customer_name,
            total_cartons: targetRecord.total_cartons,
            total_mtrs: targetRecord.total_mtrs,
            total_value: targetRecord.total_value
          },
          performed_by: profile?.username || 'Admin'
        });
      }

      const actionName = status === 'completed' ? 'posted' : status;
      toast.success(`Gate pass ${targetRecord.gate_pass_no} ${actionName} successfully.`);
      fetchData();
    } catch (err: any) {
      toast.error(`Error updating record: ${err.message}`);
    } finally {
      setCompleteConfirmOpen(false);
      setActionRecord(null);
    }
  };

  const handleUnpost = async () => {
    if (!actionRecord || !isSuperAdmin) return;
    setIsProcessingAction(true);
    try {
      const { error } = await supabase
        .from('gate_pass_records')
        .update({ status: 'dispatched' })
        .eq('id', actionRecord.id);
      if (error) throw error;

      await logAuditActivity({
        action: 'GATE_PASS_UNPOSTED',
        entity_type: 'gate_pass',
        entity_id: actionRecord.gate_pass_no,
        details: {
          previous_status: 'completed',
          new_status: 'dispatched',
          reason: reversalReason.trim() || 'No reason specified',
          customer: actionRecord.customer_name,
          total_cartons: actionRecord.total_cartons
        },
        performed_by: profile?.username || 'Super Admin'
      });

      toast.success(`Gate pass ${actionRecord.gate_pass_no} unposted. Associated invoices marked as Not Posted.`);
      fetchData();
    } catch (err: any) {
      toast.error(`Error unposting gate pass: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
      setUnpostConfirmOpen(false);
      setReversalReason("");
      setActionRecord(null);
    }
  };

  const handleUndispatch = async () => {
    if (!actionRecord || !isSuperAdmin) return;
    setIsProcessingAction(true);
    try {
      const { error } = await supabase
        .from('gate_pass_records')
        .update({ status: 'pending' })
        .eq('id', actionRecord.id);
      if (error) throw error;

      await logAuditActivity({
        action: 'GATE_PASS_UNDISPATCHED',
        entity_type: 'gate_pass',
        entity_id: actionRecord.gate_pass_no,
        details: {
          previous_status: 'dispatched',
          new_status: 'pending',
          reason: reversalReason.trim() || 'No reason specified',
          customer: actionRecord.customer_name,
          total_cartons: actionRecord.total_cartons
        },
        performed_by: profile?.username || 'Super Admin'
      });

      toast.success(`Gate pass ${actionRecord.gate_pass_no} reverted to Pending. It can now be edited or deleted.`);
      fetchData();
    } catch (err: any) {
      toast.error(`Error reverting dispatch: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
      setUndispatchConfirmOpen(false);
      setReversalReason("");
      setActionRecord(null);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Gate_Pass-${viewingRecord?.gate_pass_no}`,
    suppressErrors: true,
  });

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      toast.error("No records to export.");
      return;
    }

    const exportData = filteredData.map(record => ({
      "Gate Pass No": record.gate_pass_no,
      "Date": format(new Date(record.created_at), 'yyyy-MM-dd HH:mm'),
      "Customer Name": record.customer_name,
      "Vehicle Number": record.vehicle_number,
      "Driver Name": record.driver_name,
      "Total Cartons": record.total_cartons,
      "Total MTRS": record.total_mtrs,
      "Total Value ($)": record.total_value,
      "Location": record.location,
      "Created By": record.created_by,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gate Passes");
    XLSX.writeFile(workbook, `Gate_Pass_Records_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const filteredData = useMemo(() => {
    const filtered = data.filter(row => {
      let matchesSearch = true;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        matchesSearch = (
          row.gate_pass_no.toLowerCase().includes(term) ||
          row.customer_name.toLowerCase().includes(term) ||
          row.vehicle_number.toLowerCase().includes(term) ||
          row.date.includes(term)
        );
      }
      
      if (!matchesSearch) return false;

      if (completedFilter !== "all") {
        const s = row.status || 'pending';
        if (completedFilter === "completed" && s !== 'completed') return false;
        if (completedFilter === "not-completed" && s === 'completed') return false;
        if (completedFilter === "pending" && (s === 'completed' || s === 'dispatched')) return false;
        if (completedFilter === "dispatched" && s !== 'dispatched') return false;
      }

      if (dateFilter === "all") return true;

      const rowDate = new Date(row.created_at);
      
      if (dateFilter === "today") {
        return isToday(rowDate);
      } else if (dateFilter === "this-week") {
        return isThisWeek(rowDate, { weekStartsOn: 1 });
      } else if (dateFilter === "this-month") {
        return isThisMonth(rowDate);
      } else if (dateFilter === "custom") {
        if (customStartDate && customEndDate) {
           const start = startOfDay(new Date(customStartDate));
           const end = endOfDay(new Date(customEndDate));
           return isWithinInterval(rowDate, { start, end });
        } else if (customStartDate) {
           const start = startOfDay(new Date(customStartDate));
           return rowDate >= start;
        } else if (customEndDate) {
           const end = endOfDay(new Date(customEndDate));
           return rowDate <= end;
        }
      }

      return true;
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'date') {
        const aDate = new Date(`${a.date} ${a.time}`).getTime();
        const bDate = new Date(`${b.date} ${b.time}`).getTime();
        aVal = isNaN(aDate) ? 0 : aDate;
        bVal = isNaN(bDate) ? 0 : bDate;
      } else if (sortField === 'total_mtrs' || sortField === 'total_value' || sortField === 'total_cartons') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, searchTerm, dateFilter, customStartDate, customEndDate, completedFilter, sortField, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, customStartDate, customEndDate, completedFilter, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const companyLogo = companySettings?.logo_url || localStorage.getItem('gate_pass_logo');

  return (
    <div className="flex flex-col flex-1 h-full gap-2 overflow-hidden pb-1">
      <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs mb-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search GP No, Custom, Vehicle, Date..."
            className="pl-8 h-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-3">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Range:</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="custom">Date</option>
          </select>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-3">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Status:</span>
          <select
            value={completedFilter}
            onChange={(e) => setCompletedFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {isAdmin ? (
              <>
                <option value="all">All Status</option>
                <option value="completed">Posted</option>
                <option value="pending">Pending</option>
                <option value="dispatched">Dispatched</option>
              </>
            ) : (
              <>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="dispatched">Dispatched</option>
              </>
            )}
          </select>
        </div>
        
        {(dateFilter === 'custom' || customStartDate || customEndDate) && (
          <div className="flex items-center gap-2 animate-in fade-in duration-200">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => { setCustomStartDate(e.target.value); setDateFilter('custom'); }}
              className="h-9 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2 py-1 text-xs shadow-sm"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => { setCustomEndDate(e.target.value); setDateFilter('custom'); }}
              className="h-9 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2 py-1 text-xs shadow-sm"
            />
          </div>
        )}

        <div className="flex-1" /> {/* Spacer */}

        <Badge variant="secondary" className="px-3 py-1 text-sm font-medium whitespace-nowrap">
          {filteredData.length} Records
        </Badge>

        <Button onClick={handleExportExcel} variant="outline" size="sm" className="h-9">
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>

      <div className="border rounded-md bg-card w-full min-w-0 flex-1 overflow-auto">
        <Table className="min-w-[1000px]">
          <TableHeader className="bg-slate-200 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <SortableTableHead label="Gate Pass No" field="gate_pass_no" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} className="whitespace-nowrap" />
              <SortableTableHead label="Date & Time" field="date" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} className="whitespace-nowrap" />
              <SortableTableHead label="Customer Name" field="customer_name" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} className="whitespace-nowrap min-w-[200px]" />
              <SortableTableHead label="Vehicle / Driver" field="vehicle_number" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} className="whitespace-nowrap" />
              <SortableTableHead label="MTRS" field="total_mtrs" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} align="right" className="whitespace-nowrap" />
              <SortableTableHead label="Value ($)" field="total_value" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} align="right" className="whitespace-nowrap" />
              <SortableTableHead label="Cartons" field="total_cartons" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} align="right" className="whitespace-nowrap" />
              <SortableTableHead label="Created By" field="created_by" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} className="whitespace-nowrap" />
              <TableHead className="whitespace-nowrap text-center">Status</TableHead>
              <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                    Loading records...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-48 text-center text-muted-foreground font-medium">
                  No gate pass records found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold text-primary">{row.gate_pass_no}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{row.date}</span>
                      <span className="text-xs text-muted-foreground">{row.time}</span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate max-w-[200px]" title={row.customer_name}>{row.customer_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.vehicle_number}</span>
                      <span className="text-xs text-muted-foreground">{row.driver_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{(Number(row.total_mtrs) || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{(Number(row.total_value) || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.total_cartons}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{row.created_by}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(row.created_at), "dd/MM h:mm a")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {row.status === 'completed' ? <Badge className="bg-emerald-500">Posted</Badge> :
                     row.status === 'dispatched' ? <Badge className="bg-blue-500">Dispatched</Badge> :
                     <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-50 dark:bg-yellow-950/20">Pending</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewingRecord(row)} title="View / Reprint">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {row.status !== 'completed' && row.status !== 'dispatched' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Dispatch Goods"
                          onClick={() => {
                            setActionRecord(row);
                            setDispatchConfirmOpen(true);
                          }}
                        >
                          <Truck className="h-4 w-4 text-blue-500 hover:text-blue-600" />
                        </Button>
                      )}
                      {isAdmin && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Edit"
                            disabled={row.status === 'locked' || row.status === 'completed' || row.status === 'dispatched'}
                            onClick={() => setEditingRecord(row)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title={
                              row.status === 'completed' 
                                ? 'Already Posted' 
                                : row.status !== 'dispatched' 
                                  ? 'Cannot post: Must be dispatched first' 
                                  : 'Post Gate Pass'
                            }
                            disabled={row.status === 'completed'}
                            onClick={() => {
                              if (row.status !== 'dispatched') {
                                toast.error(`Cannot post Gate Pass ${row.gate_pass_no}! Goods must be dispatched first before posting.`);
                                return;
                              }
                              setActionRecord(row);
                              setCompleteConfirmOpen(true);
                            }}
                            className={
                              row.status === 'completed'
                                ? 'opacity-40'
                                : row.status !== 'dispatched'
                                  ? 'text-slate-400 hover:text-amber-500 dark:text-slate-600 dark:hover:text-amber-400'
                                  : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                            }
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          {/* Super Admin Reversal: Unpost */}
                          {isSuperAdmin && row.status === 'completed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Unpost Gate Pass (Super Admin)"
                              className="text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                              onClick={() => {
                                setActionRecord(row);
                                setReversalReason("");
                                setUnpostConfirmOpen(true);
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Super Admin Reversal: Revert to Pending */}
                          {isSuperAdmin && row.status === 'dispatched' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Revert to Pending (Super Admin)"
                              className="text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                              onClick={() => {
                                setActionRecord(row);
                                setReversalReason("");
                                setUndispatchConfirmOpen(true);
                              }}
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            disabled={!isSuperAdmin && (row.status === 'locked' || row.status === 'completed' || row.status === 'dispatched')}
                            title={
                              isSuperAdmin
                                ? "Delete Gate Pass (Super Admin)"
                                : (row.status === 'completed' || row.status === 'dispatched' || row.status === 'locked')
                                  ? "Cannot delete processed gate pass"
                                  : "Delete Gate Pass"
                            }
                            onClick={() => {
                              setRecordToDelete(row);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Compact Pagination Controls */}
      {filteredData.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/90 dark:bg-slate-900/40 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] text-muted-foreground shrink-0 shadow-xs mb-0">
          <div>
            Showing <span className="font-semibold text-foreground">{(currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, filteredData.length)}</span> of{" "}
            <span className="font-semibold text-foreground">{filteredData.length}</span> records
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              title="First Page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              title="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <span className="px-2 py-0.5 font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              title="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              title="Last Page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* View / Print Modal */}
      <Dialog open={!!viewingRecord} onOpenChange={(open) => !open && setViewingRecord(null)}>
        <DialogContent className="w-[95vw] max-w-4xl sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
          <div className="flex items-center justify-between p-4 border-b pr-12">
            <DialogTitle>View Gate Pass: {viewingRecord?.gate_pass_no}</DialogTitle>
            <Button onClick={() => handlePrint()}><Printer className="mr-2 h-4 w-4" /> Reprint</Button>
          </div>
          
          <div className="flex-1 overflow-auto p-4 sm:p-8 bg-gray-50/50 relative">
            {viewingRecord && (
              <div className="border bg-white rounded-md p-8 text-black gate-pass-container shadow-sm mx-auto min-w-[800px] max-w-[900px]" ref={printRef}>
        
                <div className="text-center mb-6 pt-4">
                  {companyLogo && (
                    <div className="flex justify-center mb-4">
                      <img src={companyLogo} alt="Company Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <h2 className="text-xl sm:text-2xl font-bold uppercase">{companySettings?.company_name || 'Stretchline (Private) Limited - Mount Lavinia'}</h2>
                  <p className="text-sm">{companySettings?.business_address}</p>
                  {companySettings?.registered_address && <p className="text-sm">{companySettings.registered_address}</p>}
                  <p className="text-sm">{companySettings?.contact_line}</p>
                  <div className="mt-4 py-2 border-y-2 border-black font-bold text-lg text-center tracking-widest">
                    CONTROLLED BY COMMERCIAL & LOGISTICS DEPARTMENT
                  </div>
                  <h3 className="mt-4 text-xl font-bold uppercase underline">GATE PASS</h3>
                </div>

                <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-6 text-sm">
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Gate Pass No :</span>
                    <span className="font-bold">{viewingRecord.gate_pass_no}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Vehicle No :</span>
                    <span>{viewingRecord.vehicle_number}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Date :</span>
                    <span>{viewingRecord.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Driver Name :</span>
                    <span>{viewingRecord.driver_name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Time :</span>
                    <span>{viewingRecord.time}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Phone No :</span>
                    <span>{viewingRecord.phone_number}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Location :</span>
                    <span>{viewingRecord.location}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold w-24 text-right">Driver NIC :</span>
                    <span>{viewingRecord.nic}</span>
                  </div>
                  <div className="flex gap-2 min-w-0">
                    <span className="font-semibold w-24 text-right">Customer:</span>
                    <span className="truncate" title={viewingRecord.customer_name}>{viewingRecord.customer_name}</span>
                  </div>
                  <div className="flex gap-2 whitespace-nowrap">
                    <span className="font-semibold w-24 text-right">Seal Number :</span>
                    <span>..............................................</span>
                  </div>
                </div>

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
                    {viewingRecord.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border border-black p-2 text-center">{idx + 1}</td>
                        <td className="border border-black p-2 font-medium">{row.invoice}</td>
                        <td className="border border-black p-2 text-center">{row.do}</td>
                        <td className="border border-black p-2 text-right">{(Number(row.mtrs) || 0).toLocaleString()}</td>
                        <td className="border border-black p-2 text-center">{row.cartons || 0}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} className="border border-black p-2 font-bold text-right">TOTAL</td>
                      <td className="border border-black p-2 font-bold text-right">{(Number(viewingRecord.total_mtrs) || 0).toLocaleString()}</td>
                      <td className="border border-black p-2 font-bold text-center">{viewingRecord.total_cartons}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="flex justify-between items-center font-bold text-lg mb-16">
                  <div>TOTAL NUMBER OF CARTONS = <span className="border-b border-black inline-block w-16 text-center">{viewingRecord.total_cartons}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-8 text-center mt-12 mb-8 animate-fade-in">
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
                  Created by: {viewingRecord.created_by} at {format(new Date(viewingRecord.created_at), "dd/MM/yyyy HH:mm:ss")}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      
      {/* Edit Modal */}
      <EditGatePassModal 
        record={editingRecord}
        onClose={() => setEditingRecord(null)}
        onSaved={() => {
          setEditingRecord(null);
          fetchData();
        }}
      />

      {/* Complete Confirm Modal */}
      <Dialog open={dispatchConfirmOpen} onOpenChange={setDispatchConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-blue-600">
              <Truck className="h-5 w-5 mr-2" /> Confirm Dispatch
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to mark Gate Pass {actionRecord?.gate_pass_no} as dispatched? This action will notify the admin that the goods have left the premises.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
              handleUpdateStatus('dispatched', actionRecord);
              setDispatchConfirmOpen(false);
            }}>
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-emerald-600">
              <CheckCircle className="h-5 w-5 mr-2" /> Confirm Post Gate Pass
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to post Gate Pass <strong className="font-semibold text-slate-900 dark:text-slate-100">{actionRecord?.gate_pass_no}</strong>? All invoices will be marked as Posted in Invoice Records. This will also prevent any further edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium" onClick={() => handleUpdateStatus('completed')}>
              Post Gate Pass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete Gate Pass {recordToDelete?.gate_pass_no}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super Admin Unpost Modal */}
      <Dialog open={unpostConfirmOpen} onOpenChange={setUnpostConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-amber-600">
              <RotateCcw className="h-5 w-5 mr-2" /> Reverse / Unpost Gate Pass
            </DialogTitle>
            <DialogDescription>
              You are about to unpost Gate Pass <strong className="font-semibold text-slate-900 dark:text-slate-100">{actionRecord?.gate_pass_no}</strong>. 
              This will revert the status back to <span className="font-medium text-blue-600">Dispatched</span>, and all associated invoices in Invoice Records will revert back to <span className="font-medium text-amber-600">Not Posted</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reason for Reversal / Unpost (Required for audit log):
            </label>
            <Input 
              placeholder="e.g. Invoiced amount correction required, customer requested revision..."
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isProcessingAction} onClick={() => setUnpostConfirmOpen(false)}>Cancel</Button>
            <Button 
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium" 
              disabled={isProcessingAction}
              onClick={handleUnpost}
            >
              {isProcessingAction ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Unpost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Super Admin Undispatch Modal */}
      <Dialog open={undispatchConfirmOpen} onOpenChange={setUndispatchConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-orange-600">
              <Undo2 className="h-5 w-5 mr-2" /> Revert Dispatch to Pending
            </DialogTitle>
            <DialogDescription>
              You are about to revert Gate Pass <strong className="font-semibold text-slate-900 dark:text-slate-100">{actionRecord?.gate_pass_no}</strong> back to <span className="font-medium text-yellow-600">Pending</span>. 
              This will allow editing carton counts, customer details, or deleting the gate pass.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reason for Reversion (Required for audit log):
            </label>
            <Input 
              placeholder="e.g. Wrong vehicle assigned, goods not loaded yet..."
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isProcessingAction} onClick={() => setUndispatchConfirmOpen(false)}>Cancel</Button>
            <Button 
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium" 
              disabled={isProcessingAction}
              onClick={handleUndispatch}
            >
              {isProcessingAction ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Revert to Pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
