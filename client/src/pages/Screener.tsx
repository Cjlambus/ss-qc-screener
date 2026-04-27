import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, User, Mail, X, Plus } from "lucide-react";

export default function Screener() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(f => f.type === "application/pdf");
    const nonPdfs = Array.from(incoming).length - pdfs.length;
    if (nonPdfs > 0) {
      toast({ title: "PDF files only", description: `${nonPdfs} non-PDF file(s) were skipped.`, variant: "destructive" });
    }
    if (pdfs.length === 0) return;

    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      const newOnes = pdfs.filter(f => !existing.has(f.name));
      if (newOnes.length < pdfs.length) {
        toast({ title: "Duplicate skipped", description: "A file with that name is already in the list." });
      }
      return [...prev, ...newOnes];
    });
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      toast({ title: "No files selected", description: "Drop at least one screening form PDF.", variant: "destructive" });
      return;
    }
    if (!clientName.trim()) { toast({ title: "Client name required", variant: "destructive" }); return; }
    if (!clientEmail.trim()) { toast({ title: "Client email required", variant: "destructive" }); return; }

    setLoading(true);
    const reviewIds: number[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress({ current: i + 1, total: selectedFiles.length, label: file.name });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("clientName", clientName.trim());
        formData.append("clientEmail", clientEmail.trim());

        const res = await fetch("/api/review", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${data.error || "QC review failed"}`);
        reviewIds.push(data.review.id);
      }

      const totalGaps = reviewIds.length; // we'll navigate to a summary or the last review
      toast({
        title: selectedFiles.length === 1 ? "QC complete" : `${selectedFiles.length} forms screened`,
        description: selectedFiles.length === 1
          ? "Review the results below."
          : "All forms processed. Viewing combined results.",
      });

      if (selectedFiles.length === 1) {
        navigate(`/review/${reviewIds[0]}`);
      } else {
        // For multiple forms, go to history filtered by this batch
        navigate(`/history?client=${encodeURIComponent(clientName.trim())}&batch=${encodeURIComponent(reviewIds.join(","))}`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--color-navy)" }}>Screen a Client</h1>
          <p className="text-muted-foreground text-sm">Drop one or more PandaDoc screening form PDFs. The QC engine evaluates every field and generates a coaching report and email draft for each form.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client info */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clientName" className="flex items-center gap-1.5 text-sm font-medium">
                    <User className="w-3.5 h-3.5" /> Client Name
                  </Label>
                  <Input
                    id="clientName"
                    data-testid="input-client-name"
                    placeholder="First Last"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientEmail" className="flex items-center gap-1.5 text-sm font-medium">
                    <Mail className="w-3.5 h-3.5" /> Client Email
                  </Label>
                  <Input
                    id="clientEmail"
                    data-testid="input-client-email"
                    type="email"
                    placeholder="client@email.com"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Drop zone */}
          <div
            data-testid="drop-zone"
            className={`drop-zone rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver ? "drag-over" : ""}`}
            style={{ background: dragOver ? "hsl(222 65% 25% / 0.04)" : "white" }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !loading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)}
              data-testid="input-file"
            />

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-muted">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "var(--color-navy)" }}>
                  {selectedFiles.length > 0 ? "Drop more forms here" : "Drop screening form PDFs here"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  or click to browse — drop all 5 forms at once if you have them
                </div>
              </div>
              {selectedFiles.length === 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-1">
                  {["RFI", "MSK", "GI", "Headaches", "Mental Health"].map(form => (
                    <span key={form} className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground bg-muted">{form}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* File list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedFiles.length} form{selectedFiles.length > 1 ? "s" : ""} queued
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  <Plus className="w-3 h-3" /> Add more
                </button>
              </div>
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-white"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--color-gold-pale)" }}>
                    <FileText className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: "var(--color-navy)" }}>{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            type="submit"
            data-testid="button-run-qc"
            disabled={loading || selectedFiles.length === 0}
            className="w-full h-11 text-sm font-semibold"
            style={{ background: "var(--color-navy)", color: "white" }}
          >
            {loading && progress ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing {progress.current} of {progress.total}...
              </span>
            ) : loading ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running QC...</span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {selectedFiles.length > 1 ? `Run QC on ${selectedFiles.length} Forms` : "Run QC Screen"}
              </span>
            )}
          </Button>
        </form>

        {/* Info callout */}
        <div className="mt-8 p-4 rounded-lg border border-border bg-muted/50 flex gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            The QC engine evaluates every field against the Semper Solutus narrative standards — onset detail, location, symptom specificity, functional impact, and medication accuracy. After the screen, you can review gaps, edit the email draft, and copy it to send via Gmail.
          </p>
        </div>
      </div>
    </Layout>
  );
}
