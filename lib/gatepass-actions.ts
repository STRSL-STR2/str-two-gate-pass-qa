import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { toast } from "sonner";

export interface GatePassEmailData {
  gate_pass_no: string;
  date?: string;
  time?: string;
  location?: string;
  vehicle_number?: string;
  driver_name?: string;
  phone_number?: string;
  nic?: string;
  customer_name?: string;
  total_cartons?: number | string;
  total_mtrs?: number | string;
  total_value?: number | string;
  invoice_count?: number | string;
}

export const downloadGatePassAsPdf = async (
  element: HTMLElement | null,
  gatePassNo: string
): Promise<void> => {
  if (!element) {
    toast.error("Nothing to print / download.");
    return;
  }

  const toastId = toast.loading("Generating PDF document...");
  try {
    const canvas = await (html2canvas as any)(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: (clonedDoc: Document) => {
        // Sanitize any styles that html2canvas cannot parse
        const styles = clonedDoc.querySelectorAll("style");
        styles.forEach((style) => {
          if (style.innerHTML) {
            style.innerHTML = style.innerHTML
              .replace(/oklch\([^)]+\)/gi, "#000000")
              .replace(/color-mix\([^)]+\)/gi, "#000000");
          }
        });
      },
    });

    // Use JPEG at 0.92 quality to compress PDF from 24MB down to ~300KB with crystal clear clarity
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    pdf.save(`${gatePassNo || "Gate_Pass"}.pdf`);
    toast.dismiss(toastId);
    toast.success(`PDF downloaded: ${gatePassNo}.pdf`);
  } catch (err: any) {
    toast.dismiss(toastId);
    console.error("PDF generation failed:", err);
    toast.error("Failed to generate PDF: " + (err.message || "Unknown error"));
  }
};

export const DEFAULT_EMAIL_SUBJECT = "Gate Pass Dispatch Advice - {gate_pass_no} - {customer_name}";
export const DEFAULT_EMAIL_BODY = [
  "Dear Team,",
  "",
  "Please find the Gate Pass dispatch details below:",
  "",
  "• Gate Pass No   : {gate_pass_no}",
  "• Date & Time    : {date} ({time})",
  "• Delivery To    : {location}",
  "• Vehicle No     : {vehicle_number}",
  "• Driver Name    : {driver_name} ({phone_number})",
  "• Customer       : {customer_name}",
  "• Total Cartons  : {total_cartons}",
  "• Total Meters   : {total_mtrs}",
  "• Total Value ($): {total_value}",
  "• Invoices Count : {invoice_count}",
  "",
  "Best regards,",
  "Commercial & Logistics Department"
].join("\n");

export const openOutlookEmailComposer = (record: GatePassEmailData) => {
  const savedSubject = localStorage.getItem("gate_pass_email_subject") || DEFAULT_EMAIL_SUBJECT;
  const savedBody = localStorage.getItem("gate_pass_email_body") || DEFAULT_EMAIL_BODY;

  const replacePlaceholders = (text: string) => {
    return text
      .replace(/{gate_pass_no}/g, String(record.gate_pass_no || ""))
      .replace(/{date}/g, String(record.date || ""))
      .replace(/{time}/g, String(record.time || ""))
      .replace(/{location}/g, String(record.location || ""))
      .replace(/{vehicle_number}/g, String(record.vehicle_number || ""))
      .replace(/{driver_name}/g, String(record.driver_name || ""))
      .replace(/{phone_number}/g, String(record.phone_number || ""))
      .replace(/{nic}/g, String(record.nic || ""))
      .replace(/{customer_name}/g, String(record.customer_name || ""))
      .replace(/{total_cartons}/g, String(record.total_cartons || 0))
      .replace(/{total_mtrs}/g, String(record.total_mtrs || 0))
      .replace(/{total_value}/g, String(record.total_value || 0))
      .replace(/{invoice_count}/g, String(record.invoice_count || 0));
  };

  const finalSubject = replacePlaceholders(savedSubject);
  const finalBody = replacePlaceholders(savedBody);

  const mailtoUrl = `mailto:?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalBody)}`;
  
  // Triggers Outlook Classic (or default system mail application)
  window.location.href = mailtoUrl;
  toast.success("Opening Outlook email client...");
};
