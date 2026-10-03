import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { PageHeader, DateRangeFilter, PresetRange } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, PackageOpen, FileText, Truck, DollarSign, Layers } from "lucide-react";
import { parseISO, format, startOfWeek, differenceInDays, startOfMonth } from "date-fns";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';

interface DashboardMetrics {
  totalMtrs: number;
  totalValue: number;
  totalDeliveries: number;
  totalInvoices: number;
  totalPostedInvoices: number;
  totalCartons: number;
}

export default function Dashboard() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalMtrs: 0,
    totalValue: 0,
    totalDeliveries: 0,
    totalInvoices: 0,
    totalPostedInvoices: 0,
    totalCartons: 0
  });

  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [customerData, setCustomerData] = useState<any[]>([]);

  // Calculate start of current month and today dynamically
  const getInitialDates = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: format(firstDay, "yyyy-MM-dd"),
      end: format(now, "yyyy-MM-dd")
    };
  };

  const initialDates = getInitialDates();
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [preset, setPreset] = useState("current-month");
  const [chartGranularity, setChartGranularity] = useState("Daily");

  const handleRangeChange = (newStart: string, newEnd: string, newPreset: PresetRange) => {
    setStartDate(newStart);
    setEndDate(newEnd);
    setPreset(newPreset);
  };

  useEffect(() => {
    if (!startDate || !endDate) return;

    const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
    const start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
    const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
    const end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (start > end) {
      toast.error("Start date cannot be after end date");
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setIsFetching(true);
        
        const daysDiff = differenceInDays(end, start);
        let currentGranularity = "Daily";
        if (daysDiff > 90) {
          currentGranularity = "Monthly";
        } else if (daysDiff > 7) {
          currentGranularity = "Weekly";
        }
        setChartGranularity(currentGranularity);

        const { data: records, error } = await supabase
          .from("gate_pass_records")
          .select("*")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString());

        if (error) throw error;

        let mTotalInvoices = 0;
        let mPostedInvoices = 0;
        
        const uniqueTotal = new Set<string>();
        const uniquePosted = new Set<string>();
        
        if (records) {
          records.forEach(gp => {
            const rows = (gp.rows || []) as any[];
            const isPosted = gp.status === 'completed';
            rows.forEach(row => {
              if (row.invoice) {
                uniqueTotal.add(row.invoice);
                if (isPosted) {
                  uniquePosted.add(row.invoice);
                }
              }
            });
          });
          mTotalInvoices = uniqueTotal.size;
          mPostedInvoices = uniquePosted.size;
        }

        let mMtrs = 0;
        let mValue = 0;
        let mCartons = 0;
        const weeklyMap = new Map<string, { date: string, rawDate: number, deliveries: number, mtrs: number, value: number }>();
        const custMap = new Map<string, { name: string, count: number, mtrs: number, value: number, invoices: number }>();

        records.forEach(r => {
          mMtrs += Number(r.total_mtrs);
          mValue += Number(r.total_value);
          mCartons += Number(r.total_cartons);

          // Groupings based on span
          let dateStr = "";
          const createdIso = parseISO(r.created_at);
          let rawDateVal = createdIso.getTime();
          
          if (currentGranularity === "Monthly") {
            const startOfMo = startOfMonth(createdIso);
            dateStr = format(startOfMo, "MMM yyyy");
            rawDateVal = startOfMo.getTime();
          } else if (currentGranularity === "Weekly") {
            const startOfWk = startOfWeek(createdIso, { weekStartsOn: 1 });
            dateStr = format(startOfWk, "MMM dd");
            rawDateVal = startOfWk.getTime();
          } else {
            dateStr = format(createdIso, "MMM dd");
          }

          if (!weeklyMap.has(dateStr)) {
            weeklyMap.set(dateStr, { date: dateStr, rawDate: rawDateVal, deliveries: 0, mtrs: 0, value: 0 });
          }
          const day = weeklyMap.get(dateStr)!;
          day.deliveries += 1;
          day.mtrs += Number(r.total_mtrs);
          day.value += Number(r.total_value);

          // Customer groupings
          const cust = r.customer_name;
          if (!custMap.has(cust)) {
            custMap.set(cust, { name: cust, count: 0, mtrs: 0, value: 0, invoices: 0 });
          }
          const c = custMap.get(cust)!;
          c.count += 1;
          c.mtrs += Number(r.total_mtrs);
          c.value += Number(r.total_value);
          c.invoices += Number(r.invoice_count);
        });

        setMetrics({
          totalMtrs: mMtrs,
          totalValue: mValue,
          totalDeliveries: records.length,
          totalInvoices: mTotalInvoices,
          totalPostedInvoices: mPostedInvoices,
          totalCartons: mCartons
        });

        setWeeklyData(Array.from(weeklyMap.values()).sort((a,b) => a.rawDate - b.rawDate));
        setCustomerData(Array.from(custMap.values()).sort((a,b) => b.value - a.value));

      } catch (err: any) {
        toast.error(`Failed to load dashboard: ${err.message}`);
      } finally {
        setIsFetching(false);
        setIsInitialLoading(false);
      }
    };

    fetchDashboardData();
  }, [startDate, endDate]);

  const COLORS = ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8'];

  return (
    <div className="flex flex-col flex-1 h-full space-y-6 overflow-y-auto pb-6">
      <PageHeader 
        title="Analytics Dashboard"
        actions={
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            preset={preset}
            onRangeChange={handleRangeChange}
            onPresetChange={setPreset as any}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            isLoading={isInitialLoading || isFetching}
          />
        } 
      />

      {isInitialLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity duration-200 ${isFetching ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quantity (MTRS)</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(Number(metrics.totalMtrs) || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(Number(metrics.totalValue) || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gate Passes</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalDeliveries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices vs Posted</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalPostedInvoices} / {metrics.totalInvoices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cartons</CardTitle>
            <PackageOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCartons}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{chartGranularity} Deliveries</CardTitle>
            <CardDescription>Number of gate passes issued per {chartGranularity === 'Monthly' ? 'month' : chartGranularity === 'Weekly' ? 'week' : 'day'}</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="deliveries" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{chartGranularity} Value Trend</CardTitle>
            <CardDescription>Value of goods shipped ($)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
            <CardDescription>By shipped value segment</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
             {customerData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerData.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {customerData.slice(0, 5).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
             ) : (
               <div className="text-muted-foreground text-sm">No data available</div>
             )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Top 5 Customers</CardTitle>
            <CardDescription>Customer summary metrics</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 font-medium">Customer Name</th>
                  <th className="px-6 py-3 font-medium text-right">Invoices</th>
                  <th className="px-6 py-3 font-medium text-right">Gate Passes</th>
                  <th className="px-6 py-3 font-medium text-right">MTRS</th>
                  <th className="px-6 py-3 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customerData.slice(0, 5).map((cust, i) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium truncate max-w-[200px]" title={cust.name}>{cust.name}</td>
                    <td className="px-6 py-4 text-right">{cust.invoices}</td>
                    <td className="px-6 py-4 text-right">{cust.count}</td>
                    <td className="px-6 py-4 text-right">{(Number(cust.mtrs) || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">${(Number(cust.value) || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {customerData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No customer data available in the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
        </div>
      )}

    </div>
  );
}
