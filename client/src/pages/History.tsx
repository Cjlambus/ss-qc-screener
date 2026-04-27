import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Mail, FileText, ChevronRight, Inbox, AlertTriangle, Copy, Check } from "lucide-react";
import type { Review } from "@shared/schema";
import { useState, useMemo } from "react";

interface QCGap {
  section: string;
  field: string;
  issue: string;
  severity: string;
  guidance?: string;
  example?: string;
}

// Build combined email entirely from gap data already in the reviews list.
// No server round-trip needed — works even if the DB was wiped on redeploy.
function buildCombinedEmail(clientName: string, failedForms: { formType: string; gaps: QCGap[] }[]) {
  const firstName = clientName.split(" ")[0];
  const totalGaps = failedForms.reduce((sum, f) => sum + f.gaps.length, 0);

  const subject =
    failedForms.length === 1
      ? `Your ${failedForms[0].formType} Form — Updates Needed Before We Move Forward`
      : `Your Screening Forms — A Few Sections Need More Detail`;

  let body =
    `Hey ${firstName},\n\n` +
    `Thank you for getting your screening forms submitted. We went through them carefully and you are making great progress. ` +
    `Before we can move this forward to your medical review, we need you to go back and add more detail to a few sections. ` +
    `Your team will be sending each form back to you so you can update and resubmit.\n\n` +
    `For each section below, we have included a draft of what you can write. These are starting points — update them with your actual experience and words. ` +
    `The doctor needs your story, not a template.\n\n` +
    `Here is exactly what needs to be updated:\n\n`;

  let itemNumber = 1;

  for (const form of failedForms) {
    body += `${"=".repeat(48)}\n`;
    body += `${form.formType.toUpperCase()} FORM\n`;
    body += `${"=".repeat(48)}\n\n`;

    for (const gap of form.gaps) {
      body += `${itemNumber}. ${gap.section} — ${gap.field}\n\n`;
      body += `${gap.issue}\n\n`;
      if (gap.guidance) {
        body += `What to add: ${gap.guidance}\n\n`;
      }
      if (gap.example) {
        body += `"${gap.example}"\n\n`;
      }
      body += `${"—".repeat(42)}\n\n`;
      itemNumber++;
    }
  }

  body +=
    `Once you have updated ${totalGaps === 1 ? "this section" : "these sections"} and resubmitted the forms, ` +
    `we will review them right away and move you on to the next step.\n\n` +
    `We have got you.\n\nThe Semper Solutus Team`;

  return { subject, body };
}

export default function History() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const batchParam = params.get("batch");
  const clientParam = params.get("client");

  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  const batchIds = batchParam ? batchParam.split(",").map(Number) : null;

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews"],
  });

  // Sort batch items to top
  const displayReviews = useMemo(() => {
    if (!reviews) return [];
    if (!batchIds) return reviews;
    return [
      ...reviews.filter(r => batchIds.includes(r.id)),
      ...reviews.filter(r => !batchIds.includes(r.id)),
    ];
  }, [reviews, batchIds]);

  const batchForms = useMemo(
    () => (batchIds && reviews ? reviews.filter(r => batchIds.includes(r.id)) : []),
    [reviews, batchIds]
  );
  const batchFailed = batchForms.filter(r => r.status === "fail");
  const batchPassed = batchForms.filter(r => r.status === "pass");
  const batchGapTotal = batchFailed.reduce((sum, r) => sum + r.gapCount, 0);

  // Build combined email client-side from gapsJson already in the reviews
  const combinedDraft = useMemo(() => {
    if (!batchIds || batchForms.length < 2 || batchFailed.length === 0) return null;
    const clientName = batchForms[0]?.clientName ?? clientParam ?? "Veteran";
    const formsWithGaps = batchFailed.map(r => ({
      formType: r.formType,
      gaps: (() => {
        try { return JSON.parse(r.gapsJson) as QCGap[]; }
        catch { return []; }
      })(),
    })).filter(f => f.gaps.length > 0);
    if (formsWithGaps.length === 0) return null;
    return buildCombinedEmail(clientName, formsWithGaps);
  }, [batchForms, batchFailed, clientParam]);

  const showCombinedDraft = !!combinedDraft;

  function copyText(text: string, type: "subject" | "body") {
    navigator.clipboard.writeText(text);
    if (type === "subject") {
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 1800);
    } else {
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 1800);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--color-navy)" }}>Review History</h1>
          <p className="text-sm text-muted-foreground">All QC screens run through this tool. Click any record to view the full report and email draft.</p>
        </div>

        {/* Batch summary banner */}
        {batchIds && batchForms.length > 0 && (
          <div
            className="mb-4 p-4 rounded-xl border flex items-start gap-3"
            style={{
              borderColor: batchFailed.length > 0 ? "var(--color-fail)" : "var(--color-pass)",
              background: batchFailed.length > 0 ? "#fef2f2" : "#f0fdf4",
            }}
          >
            {batchFailed.length > 0
              ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-fail)" }} />
              : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-pass)" }} />
            }
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1" style={{ color: "var(--color-navy)" }}>
                {clientParam} — {batchForms.length} form{batchForms.length !== 1 ? "s" : ""} screened
              </div>
              <div className="text-xs text-muted-foreground">
                {batchPassed.length} passed · {batchFailed.length} failed
                {batchGapTotal > 0 && ` · ${batchGapTotal} total gap${batchGapTotal !== 1 ? "s" : ""} across all forms`}
              </div>
            </div>
            <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => navigate("/")}>
              Screen another client
            </Button>
          </div>
        )}

        {/* Combined coaching email panel */}
        {showCombinedDraft && combinedDraft && (
          <div className="mb-6 rounded-xl border overflow-hidden" style={{ borderColor: "#1e2d6b" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: "#1e2d6b" }}>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-white" />
                <span className="text-sm font-semibold text-white">Combined Coaching Email</span>
              </div>
              <span className="text-xs text-white" style={{ opacity: 0.7 }}>
                {batchFailed.length} form{batchFailed.length !== 1 ? "s" : ""} · {batchGapTotal} gap{batchGapTotal !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                One email covering all gaps across all submitted forms. Copy subject and body, send from charles@sempersolutus.com, then unlock each failed PandaDoc for the client to resubmit.
              </p>

              {/* Subject */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</label>
                  <Button
                    size="sm" variant="ghost" className="h-7 text-xs gap-1.5 px-2"
                    onClick={() => copyText(combinedDraft.subject, "subject")}
                  >
                    {copiedSubject ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedSubject ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="rounded-lg px-3 py-2 text-sm font-medium border" style={{ background: "#f8f9fc", borderColor: "#e2e5ed" }}>
                  {combinedDraft.subject}
                </div>
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Body</label>
                  <Button
                    size="sm" variant="ghost" className="h-7 text-xs gap-1.5 px-2"
                    onClick={() => copyText(combinedDraft.body, "body")}
                  >
                    {copiedBody ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedBody ? "Copied" : "Copy"}
                  </Button>
                </div>
                <textarea
                  readOnly
                  value={combinedDraft.body}
                  rows={22}
                  className="w-full rounded-lg px-3 py-2.5 text-xs font-mono border resize-none focus:outline-none"
                  style={{ background: "#f8f9fc", borderColor: "#e2e5ed", lineHeight: "1.6" }}
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                />
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        )}

        {!isLoading && displayReviews.length === 0 && (
          <div className="py-20 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-sm">No reviews yet</h3>
            <p className="text-xs text-muted-foreground max-w-xs">Drop a client's screening forms on the main screen to run your first QC check.</p>
          </div>
        )}

        {!isLoading && displayReviews.length > 0 && (
          <div className="space-y-2">
            {displayReviews.map(review => {
              const isBatchItem = batchIds?.includes(review.id);
              const date = new Date(review.reviewDate).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              });
              return (
                <Card
                  key={review.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${isBatchItem ? "ring-1 ring-navy" : ""}`}
                  onClick={() => navigate(`/review/${review.id}`)}
                >
                  <CardContent className="py-4 px-5 flex items-center gap-4">
                    <div className="shrink-0">
                      {review.status === "pass"
                        ? <CheckCircle2 className="w-5 h-5" style={{ color: "var(--color-pass)" }} />
                        : <XCircle className="w-5 h-5" style={{ color: "var(--color-fail)" }} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm truncate" style={{ color: "var(--color-navy)" }}>{review.clientName}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">{review.formType}</span>
                        {isBatchItem && (
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium" style={{ background: "var(--color-gold-pale)", color: "var(--color-gold)" }}>
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{review.fileName}</span>
                        <span>{date}</span>
                        {review.emailSent && <span className="flex items-center gap-1 text-green-600"><Mail className="w-3 h-3" />Email sent</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      {review.status === "fail" && (
                        <span className="badge-fail text-xs px-2.5 py-1 rounded-full">
                          {review.gapCount} gap{review.gapCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {review.status === "pass" && (
                        <span className="badge-pass text-xs px-2.5 py-1 rounded-full">Passed</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
