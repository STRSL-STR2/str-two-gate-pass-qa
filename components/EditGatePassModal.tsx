import React, { useState, useEffect, useMemo } from "react";
import localforage from "localforage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Loader2, Search, Plus, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GatePassRecord, GatePassRow, MasterDataRow } from "@/types";

interface Props {
  record: GatePassRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditGatePassModal({ record, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [editedRecord, setEditedRecord] = useState<GatePassRecord | null>(null);

  // Add Invoice Flow State
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [eligibleInvoices, setEligibleInvoices] = useState<MasterDataRow[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [searchInvoice, setSearchInvoice] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<MasterDataRow[]>([]);
  const [addInvoiceCartons, setAddInvoiceCartons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (record) {
      setEditedRecord(JSON.parse(JSON.stringify(record))); // Deep copy
      setShowAddPanel(false);
      setSearchInvoice("");
      setSelectedToAdd([]);
      setAddInvoiceCartons({});
    }
  }, [record]);

  const fetchEligibleInvoices = async () => {
    if (!editedRecord) return;
    setLoadingEligible(true);
    setShowAddPanel(true);
    try {
      const stored = await localforage.getItem("masterData");
      if (!stored) {
        setEligibleInvoices([]);
        return;
      }
      const localMasterData: MasterDataRow[] = stored as MasterDataRow[];
      
      const { data: gpRecords } = await supabase
        .from('gate_pass_records')
        .select('gate_pass_no, rows');
        
      const issuedInvoices = new Set<string>();
      if (gpRecords) {
        for (const gp of gpRecords) {
          const rows = gp.rows as any[];
          for (const row of rows) {
            issuedInvoices.add(row.invoice);
          }
        }
      }
      
      // Determine customer name
      let custName = editedRecord.customer_name;
      if (!custName && editedRecord.rows.length > 0) {
        const firstInv = editedRecord.rows[0].invoice;
        const matchingRow = localMasterData.find(r => r.invoice === firstInv);
        if (matchingRow) custName = matchingRow.name;
      }
      
      const aggregatedMap = new Map<string, MasterDataRow>();
      const groupDetails = new Map<string, {
        order_nos: Set<string>;
        do_bols: Set<string>;
        cust_pos: Set<string>;
        buyers: Set<string>;
        locations: Set<string>;
      }>();

      for (const row of localMasterData) {
        const invNo = row.invoice;
        if (!groupDetails.has(invNo)) {
          groupDetails.set(invNo, {
            order_nos: new Set<string>(),
            do_bols: new Set<string>(),
            cust_pos: new Set<string>(),
            buyers: new Set<string>(),
            locations: new Set<string>(),
          });
        }
        
        const details = groupDetails.get(invNo)!;
        if (row.order_no) details.order_nos.add(row.order_no);
        if (row.do_bol) details.do_bols.add(row.do_bol);
        if (row.cust_po) details.cust_pos.add(row.cust_po);
        if (row.ship_via_description) details.buyers.add(row.ship_via_description);
        if (row.consignee_address_3) details.locations.add(row.consignee_address_3);

        if (aggregatedMap.has(invNo)) {
          const existing = aggregatedMap.get(invNo)!;
          existing.qty_invoiced = Number(existing.qty_invoiced) + Number(row.qty_invoiced);
          existing.extended_price = Number(existing.extended_price) + Number(row.extended_price);
          if (row.rma_status) {
            existing.rma_status = true;
          }
        } else {
          aggregatedMap.set(invNo, { ...row });
        }
      }

      const finalEligible: MasterDataRow[] = [];
      for (const [invNo, row] of aggregatedMap.entries()) {
        const details = groupDetails.get(invNo)!;
        row.order_no = Array.from(details.order_nos).join(", ");
        row.do_bol = Array.from(details.do_bols).join(", ");
        row.cust_po = Array.from(details.cust_pos).join(", ");
        row.ship_via_description = Array.from(details.buyers).join(", ");
        row.consignee_address_3 = Array.from(details.locations).join(", ");
        
        const isSameCustomer = row.name === custName;
        const isNotIssued = !issuedInvoices.has(invNo); 
        const hasNoRMA = !row.rma_status;
        const notInEdited = !editedRecord.rows.some(r => r.invoice === invNo); 
        
        if (isSameCustomer && isNotIssued && hasNoRMA && notInEdited) {
          finalEligible.push(row);
        }
      }
      
      setEligibleInvoices(finalEligible);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load eligible invoices");
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleConfirmAddInvoices = () => {
    if (!editedRecord) return;
    
    // Validate cartons
    const hasZeroCartons = selectedToAdd.some(row => {
      const cartonsCount = Number(addInvoiceCartons[row.invoice] || 0);
      return cartonsCount === 0;
    });

    if (hasZeroCartons) {
      toast.error("One or more selected invoices have 0 cartons. Please enter a valid carton count.");
      return;
    }

    const newGatePassRows = selectedToAdd.map(r => ({
      invoice: r.invoice,
      mtrs: r.qty_invoiced,
      value: r.extended_price,
      buyer: r.ship_via_description,
      po: r.cust_po || "",
      do: r.do_bol,
      cartons: Number(addInvoiceCartons[r.invoice] || 0),
      remark: ""
    }));

    const combinedRows = [...editedRecord.rows, ...newGatePassRows];
    
    const totalMtrs = combinedRows.reduce((acc, r) => acc + Number(r.mtrs || 0), 0);
    const totalValue = combinedRows.reduce((acc, r) => acc + Number(r.value || 0), 0);
    const totalCartons = combinedRows.reduce((acc, r) => acc + Number(r.cartons || 0), 0);
    
    setEditedRecord({
      ...editedRecord,
      rows: combinedRows,
      total_mtrs: totalMtrs,
      total_value: totalValue,
      total_cartons: totalCartons,
      invoice_count: combinedRows.length
    });

    // Reset panel state
    setShowAddPanel(false);
    setSelectedToAdd([]);
    setAddInvoiceCartons({});
  };

  const filteredEligibleInvoices = useMemo(() => {
    if (!searchInvoice) return eligibleInvoices;
    const lower = searchInvoice.toLowerCase();
    return eligibleInvoices.filter(r => 
      r.invoice.toLowerCase().includes(lower) || 
      (r.do_bol && r.do_bol.toLowerCase().includes(lower)) ||
      (r.order_no && r.order_no.toLowerCase().includes(lower)) ||
      (r.cust_po && r.cust_po.toLowerCase().includes(lower))
    );
  }, [eligibleInvoices, searchInvoice]);

  const toggleSelectInvoice = (row: MasterDataRow) => {
    if (selectedToAdd.some(r => r.invoice === row.invoice)) {
      setSelectedToAdd(prev => prev.filter(r => r.invoice !== row.invoice));
    } else {
      setSelectedToAdd(prev => [...prev, row]);
      if (!addInvoiceCartons[row.invoice]) {
        setAddInvoiceCartons(prev => ({ ...prev, [row.invoice]: "" }));
      }
    }
  };

  if (!editedRecord) return null;

  const handleRemoveInvoice = (invoiceNo: string) => {
    const updatedRows = editedRecord.rows.filter((r: GatePassRow) => r.invoice !== invoiceNo);
    
    // Recalculate totals
    const totalMtrs = updatedRows.reduce((acc, r) => acc + Number(r.mtrs || 0), 0);
    const totalValue = updatedRows.reduce((acc, r) => acc + Number(r.value || 0), 0);
    const totalCartons = updatedRows.reduce((acc, r) => acc + Number(r.cartons || 0), 0);
    
    setEditedRecord({
      ...editedRecord,
      rows: updatedRows,
      total_mtrs: totalMtrs,
      total_value: totalValue,
      total_cartons: totalCartons,
      invoice_count: updatedRows.length
    });
  };

  const handleSave = async () => {
    if (editedRecord.rows.length === 0) {
      toast.error("A Gate Pass must have at least one invoice.");
      return;
    }
    
    setSaving(true);

    // Double check with database using fast RPC function
    try {
      const invoiceList = editedRecord.rows.map(r => String(r.invoice).trim()).filter(Boolean);
      const { data: duplicateData, error: rpcErr } = await supabase.rpc('check_duplicate_invoices', {
        target_invoices: invoiceList
      });

      if (!rpcErr && duplicateData && duplicateData.length > 0) {
        const otherDup = duplicateData.find((d: any) => d.gate_pass_no !== editedRecord.gate_pass_no);
        if (otherDup) {
          toast.error(`Cannot save: Invoice ${otherDup.invoice} already exists in Gate Pass ${otherDup.gate_pass_no}.`);
          setSaving(false);
          return;
        }
      }

      // Fallback
      if (rpcErr) {
        const { data: allGps, error: err } = await supabase
          .from('gate_pass_records')
          .select('id, gate_pass_no, rows')
          .neq('id', editedRecord.id);

        if (!err && allGps) {
          let existingGpNo = null;
          let existingInvoice = null;
          outer: for (const gp of allGps) {
            const rows = gp.rows as any[];
            for (const row of rows) {
              if (editedRecord.rows.some(er => er.invoice === row.invoice)) {
                existingGpNo = gp.gate_pass_no;
                existingInvoice = row.invoice;
                break outer;
              }
            }
          }
          if (existingGpNo) {
            toast.error(`Cannot save: Invoice ${existingInvoice} already exists in Gate Pass ${existingGpNo}.`);
            setSaving(false);
            return;
          }
        }
      }
    } catch(e) {
      console.warn("Could not run pre-flight check", e);
    }

    try {
      const { error } = await supabase
        .from('gate_pass_records')
        .update({
          vehicle_number: editedRecord.vehicle_number,
          driver_name: editedRecord.driver_name,
          phone_number: editedRecord.phone_number,
          nic: editedRecord.nic,
          location: editedRecord.location,
          time: editedRecord.time,
          rows: editedRecord.rows,
          total_mtrs: editedRecord.total_mtrs,
          total_value: editedRecord.total_value,
          total_cartons: editedRecord.total_cartons,
          invoice_count: editedRecord.invoice_count,
        })
        .eq('id', editedRecord.id);
        
      if (error) throw error;
      toast.success("Gate pass updated successfully!");
      onSaved();
    } catch (err: any) {
      toast.error(`Error updating record: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl sm:max-w-6xl max-h-[90vh] flex flex-col">
        {showAddPanel ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAddPanel(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Add Invoices to Gate Pass
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-4 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by Invoice, DO, or PO..."
                    className="pl-8"
                    value={searchInvoice}
                    onChange={(e) => setSearchInvoice(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>DO / BOL</TableHead>
                      <TableHead className="w-[150px]">PO</TableHead>
                      <TableHead className="text-right">Qty (Mtrs)</TableHead>
                      <TableHead className="text-right">Cartons</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEligible ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredEligibleInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No eligible invoices found for this customer.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEligibleInvoices.map((row) => {
                        const isSelected = selectedToAdd.some(r => r.invoice === row.invoice);
                        return (
                          <TableRow key={row.invoice} className={isSelected ? "bg-slate-50 dark:bg-slate-800/50" : ""}>
                            <TableCell>
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectInvoice(row)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{row.invoice}</TableCell>
                            <TableCell>{row.do_bol}</TableCell>
                            <TableCell className="max-w-[150px] truncate" title={row.cust_po || ""}>{row.cust_po}</TableCell>
                            <TableCell className="text-right">{Number(row.qty_invoiced || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {isSelected ? (
                                <Input 
                                  type="number"
                                  className="h-8 w-20 text-right ml-auto"
                                  value={addInvoiceCartons[row.invoice] || ""}
                                  onChange={(e) => setAddInvoiceCartons(prev => ({...prev, [row.invoice]: e.target.value}))}
                                  placeholder="0"
                                />
                              ) : (
                                "-"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setShowAddPanel(false)}>Cancel</Button>
              <Button onClick={handleConfirmAddInvoices} disabled={selectedToAdd.length === 0}>
                Add {selectedToAdd.length} Invoice(s)
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit Gate Pass: {editedRecord.gate_pass_no}</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-4 py-4 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle Number</Label>
                  <Input 
                    value={editedRecord.vehicle_number} 
                    onChange={(e) => setEditedRecord({...editedRecord, vehicle_number: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Driver Name</Label>
                  <Input 
                    value={editedRecord.driver_name} 
                    onChange={(e) => setEditedRecord({...editedRecord, driver_name: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Driver Phone</Label>
                  <Input 
                    value={editedRecord.phone_number} 
                    onChange={(e) => setEditedRecord({...editedRecord, phone_number: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Driver NIC</Label>
                  <Input 
                    value={editedRecord.nic} 
                    onChange={(e) => setEditedRecord({...editedRecord, nic: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input 
                    value={editedRecord.location} 
                    onChange={(e) => setEditedRecord({...editedRecord, location: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  <Input 
                    value={editedRecord.time} 
                    onChange={(e) => setEditedRecord({...editedRecord, time: e.target.value})} 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Invoices</Label>
                  <Button size="sm" variant="outline" onClick={fetchEligibleInvoices}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Invoice
                  </Button>
                </div>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader className="bg-slate-200 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Buyer</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Cartons</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editedRecord.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.invoice}</TableCell>
                          <TableCell>{r.buyer}</TableCell>
                          <TableCell className="text-right">{r.mtrs}</TableCell>
                          <TableCell className="text-right">${r.value}</TableCell>
                          <TableCell className="text-right">{r.cartons}</TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleRemoveInvoice(r.invoice)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
