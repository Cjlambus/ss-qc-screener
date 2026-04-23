import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Copy,
  Mail, FileText, Calendar, User, ChevronDown, ChevronUp
} from "lucide-react";
import { useState } from "react";
import type { Review } from "@shared/schema";

interface QCGap {
  section: string;
  field: string;
  issue: string;
  severity: "critical" | "moderate";
  guidance: string;
  example?: string;
}

interface EmailDraft {
  subject: string;
  body: string;
}

export default function ReviewDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedGap, setExpandedGap] = useState<number | null>(null);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState<string | null>(null);

  const { data: review, isLoading } = useQuery<Review>({
    queryKey: ["/api/reviews", id],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/${id}`);
      if (!res.ok) throw new Error("Review not found");
      return res.json();
    },
    enabled: !!id,
  });

  const markSentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reviews/${id}/send-email`),
    onSuccess: () => {
      toast({ title: "Marked as sent", description: "Email status updated in the review log." });
      qc.invalidateQueries({ queryKey: ["/api/reviews", id] });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      </Layout>
    );
  }

  if (!review) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">Review not found.</div>
      </Layout>
    );
  }

  const gaps: QCGap[] = JSON.parse(review.gapsJson || "[]");
  const emailDraft: EmailDraft = JSON.parse(review.emailDraftJson || "{}");
  const currentSubject = emailSubject ?? emailDraft.subject ?? "";
  const currentBody = emailBody ?? emailDraft.body ?? "";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied`, description: "Paste it into your email client." });
  };

  const formattedDate = new Date(review.reviewDate).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });

  const criticalCount = gaps.filter(g => g.severity === "critical").length;
  const moderateCount = gaps.filter(g => g.severity === "moderate").length;

  return (
    <Layout>
      {/* Back */}
      <button
        data-testid="button-back"
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Screener
      </button>

      {/* Header card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                    review.status === "pass" ? "badge-pass" : "badge-fail"
                  }`}
                >
                  {review.status === "pass" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {review.status === "pass" ? "PASSED QC" : "FAILED QC"}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border font-medium">
                  {review.formType}
                </span>
              </div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-navy)" }}>{review.clientName}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{review.clientEmail}</span>
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{review.fileName}</span>
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{formattedDate}</span>
              </div>
            </div>

            {review.status === "fail" && (
              <div className="text-right shrink-0">
                <div className="text-3xl font-bold" style={{ color: "var(--color-fail)" }}>{review.gapCount}</div>
                <div className="text-xs text-muted-foreground">gap{review.gapCount === 1 ? "" : "s"} found</div>
                {criticalCount > 0 && <div className="text-xs badge-critical px-2 py-0.5 rounded mt-1">{criticalCount} critical</div>}
              </div>
            )}
          </div>

          {review.status === "pass" && (
            <div className="mt-4 p-3 rounded-lg flex items-center gap-2" style={{ background: "var(--color-pass-bg)" }}>
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--color-pass)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--color-pass)" }}>
                All fields meet the required detail standard. This form is ready for CJ to review.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-bold mb-3" style={{ color: "var(--color-navy)" }}>
            QC Gaps ({gaps.length})
          </h2>
          <div className="space-y-3">
            {gaps.map((gap, i) => (
              <div
                key={i}
                data-testid={`gap-card-${i}`}
                className={`gap-card rounded-xl border border-border bg-white overflow-hidden ${gap.severity}`}
              >
                <button
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                  onClick={() => setExpandedGap(expandedGap === i ? null : i)}
                  data-testid={`button-gap-expand-${i}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded border" style={{
                        color: gap.severity === "critical" ? "var(--color-critical)" : "var(--color-moderate)",
                        borderColor: gap.severity === "critical" ? "var(--color-critical)" : "var(--color-moderate)",
                        background: gap.severity === "critical" ? "#fef2f2" : "#fffbeb"
                      }}>
                        {gap.severity === "critical" ? "CRITICAL" : "MODERATE"}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{gap.section}</span>
                    </div>
                    <div className="font-semibold text-sm" style={{ color: "var(--color-navy)" }}>{gap.field}</div>
                    <div className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{gap.issue}</div>
                  </div>
                  {expandedGap === i ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground mt-1" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground mt-1" />}
                </button>

                {expandedGap === i && (
                  <div className="px-5 pb-5 pt-0 border-t border-border bg-muted/30">
                    <p className="text-sm text-foreground mt-3 mb-3 leading-relaxed">{gap.issue}</p>
                    {gap.guidance && (
                      <div className="p-3 rounded-lg border border-border bg-white mb-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What to Add</div>
                        <p className="text-sm leading-relaxed">{gap.guidance}</p>
                      </div>
                    )}
                    {gap.example && (
                      <div className="rounded-lg border-2 bg-white overflow-hidden" style={{ borderColor: 'var(--color-gold)' }}>
                        <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'var(--color-gold)', opacity: 0.9 }}>
                          <div className="text-xs font-bold text-white uppercase tracking-wide">Draft — Copy and Paste Into Your Form</div>
                          <button
                            className="text-xs text-white underline hover:no-underline"
                            onClick={() => { navigator.clipboard.writeText(gap.example!); }}
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="text-sm leading-relaxed p-4 whitespace-pre-wrap font-sans text-foreground">{gap.example}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Draft */}
      {review.status === "fail" && emailDraft.body && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold" style={{ color: "var(--color-navy)" }}>
                Client Email Draft
              </CardTitle>
              <div className="flex items-center gap-2">
                {review.emailSent && (
                  <span className="text-xs px-2.5 py-1 rounded-full badge-pass">Email Sent</span>
                )}
                {!review.emailSent && (
                  <Button
                    data-testid="button-mark-sent"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => markSentMutation.mutate()}
                    disabled={markSentMutation.isPending}
                  >
                    Mark as Sent
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Review and copy this draft. Send it from charles@sempersolutus.com via Gmail, then unlock the PandaDoc form for the client to resubmit.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subject */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</label>
                <button
                  data-testid="button-copy-subject"
                  onClick={() => copyToClipboard(currentSubject, "Subject line")}
                  className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <Input
                value={currentSubject}
                onChange={e => setEmailSubject(e.target.value)}
                className="text-sm"
                data-testid="input-email-subject"
              />
            </div>

            {/* To */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</label>
              <div className="px-3 py-2 rounded-md border border-border bg-muted text-sm text-muted-foreground">
                {review.clientEmail}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Body</label>
                <button
                  data-testid="button-copy-body"
                  onClick={() => copyToClipboard(currentBody, "Email body")}
                  className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <Textarea
                value={currentBody}
                onChange={e => setEmailBody(e.target.value)}
                className="text-sm min-h-[320px] font-mono leading-relaxed"
                data-testid="textarea-email-body"
              />
            </div>

            {/* Action row */}
            <div className="flex gap-3 pt-1">
              <Button
                data-testid="button-copy-all"
                onClick={() => copyToClipboard(`Subject: ${currentSubject}\n\n${currentBody}`, "Full email")}
                className="flex-1 text-sm"
                style={{ background: "var(--color-navy)", color: "white" }}
              >
                <Copy className="w-4 h-4 mr-2" /> Copy Full Email
              </Button>
              <Button
                variant="outline"
                className="text-sm"
                data-testid="button-open-gmail"
                onClick={() => window.open(`https://mail.google.com/mail/?view=cm&to=${review.clientEmail}&su=${encodeURIComponent(currentSubject)}&body=${encodeURIComponent(currentBody)}`, '_blank')}
              >
                <Mail className="w-4 h-4 mr-2" /> Open in Gmail
              </Button>
            </div>

            {/* CS reminder */}
            <div className="p-3 rounded-lg border border-border bg-muted/50 flex gap-2.5 mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-gold)" }} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                After sending this email, unlock the client's PandaDoc and return it to them so they can update and resubmit. The morning scan will automatically pick up the resubmission and re-run QC.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
}
