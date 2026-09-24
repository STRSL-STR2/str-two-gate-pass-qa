export type Role = 'admin' | 'user' | 'viewer';

export interface Profile {
  id: string;
  username: string;
  email: string;
  plain_password?: string;
  role: Role;
  is_active: boolean;
  created_at?: string;
}

export interface GatePassRecord {
  id: string;
  gate_pass_no: string;
  date: string;
  time: string;
  location: string;
  vehicle_number: string;
  driver_name: string;
  phone_number: string;
  nic: string;
  customer_name: string;
  created_by: string;
  created_at: string;
  status: string;
  rows: GatePassRow[];
  total_mtrs: number;
  total_value: number;
  total_cartons: number;
  invoice_count: number;
}

export interface GatePassRow {
  invoice: string;
  mtrs: number;
  value: number;
  buyer: string;
  po: string;
  do: string;
  cartons: number;
  remark?: string;
}

export interface MasterDataRow {
  id?: string;
  invoice: string;
  name: string;
  invoice_date: string;
  order_no: string;
  line: string;
  release: string;
  qty_invoiced: number;
  extended_price: number;
  do_bol: string;
  ship_via_description: string;
  consignee_address_3: string;
  rma: string;
  reason: string;
  rma_status: boolean;
  pending_fields: string[];
  cust_po?: string;
  gate_pass_issued?: string | null;
  cartons?: number;
}

export interface Driver {
  id: string;
  driver_name: string;
  vehicle_number: string;
  phone_number: string;
  nic: string;
}

export interface Location {
  id: string;
  location_name: string;
  is_active: boolean;
}

export interface TimeSlot {
  id: string;
  label: string;
  is_active: boolean;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  business_address: string;
  registered_address: string;
  contact_line: string;
  logo_url: string;
  signature_url?: string;
}

