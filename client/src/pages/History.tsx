import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Mail, FileText, ChevronRight, Inbox, AlertTriangle, Copy, Check } from "lucide-react";
import type { Review } from "@shared/schema";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface EmailDraft {
  subject: string;
  body: string;
}

export default function History() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const batchParam = params.get("batch");
  const clientParam = params.get("client");

  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  // If coming from a multi-form batch submission, highlight those IDs
  const batchIds = batchParam ? batchParam.split(",").map(Number) : null;

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews"],
  });

  // Fetch combined email draft for this batch
  const { data: combinedDraft, isLoading: draftLoading } = useQuery<EmailDraft>({
    queryKey: ["/api/batch-email", batchIds?.join(",")],
    queryFn: async () => {
      const res = await fetch("/api/batch-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewIds: batchIds }),
      });
      if (!res.ok) throw new Error("Failed to load combined draft");
      return res.json();
    },
    enabled: !!batchIds && batchIds.length > 1,
  });

  // If batch mode, filter and sort batch reviews to the top
  const displayReviews = reviews
    ? batchIds
      ? [
          ...reviews.filter(r => batchIds.includes(r.id)),
          ...reviews.filter(r => !batchIds.includes(r.id)),
        ]
      : reviews
    : [];

  const batchGapTotal = batchIds && reviews
    ? reviews.filter(r => batchIds.includes(r.id)).reduce((sum, r) => sum + r.gapCount, 0)
    : 0;
  const batchForms = batchIds && reviews ? reviews.filter(r => batchIds.includes(r.id)) : [];
  const batchFailed = batchForms.filter(r => r.status === "fail").length;
  const batchPassed = batchForms.filter(r => r.status === "pass").length;
  const showCombinedDraft = batchIds && batchIds.length > 1 && batchFailed > 0;

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
              borderColor: batchFailed > 0 ? "var(--color-fail)" : "var(--color-pass)",
              background: batchFailed > 0 ? "#fef2f2" : "#f0fdf4",
            }}
          >
            {batchFailed > 0
              ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-fail)" }} />
              : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-pass)" }} />
            }
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1" style={{ color: "var(--color-navy)" }}>
                {clientParam} — {batchForms.length} form{batchForms.length > 1 ? "s" : ""} screened
              </div>
              <div className="text-xs text-muted-foreground">
                {batchPassed} passed · {batchFailed} failed
                {batchGapTotal > 0 && ` · ${batchGapTotal} total gap${batchGapTotal === 1 ? "" : "s"} across all forms`}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
              onClick={() => navigate("/")}
            >
              Screen another client
            </Button>
          </div>
        )}

        {/* Combined email draft panel */}
        {showCombinedDraft && (
          <div
            className="mb-6 rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--color-navy)", borderOpacity: 0.2 }}
          >
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ background: "var(--color-navy)" }}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-white" />
                <span className="text-sm font-semibold text-white">Combined Coaching Email</span>
              </div>
              <span className="text-xs text-white opacity-70">All {batchFailed} failed form{batchFailed > 1 ? "s" : ""} · {batchGapTotal} gap{batchGapTotal !== 1 ? "s" : ""} total</span>
            </div>

            {draftLoading ? (
              <div className="p-5 text-sm text-muted-foreground">Building combined email draft...</div>
            ) : combinedDraft ? (
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Copy this single email — it covers all gaps across all submitted forms. Send from charles@sempersolutus.com, then unlock each failed PandaDoc for the client to resubmit.
                </p>

                {/* Subject line */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1.5 px-2"
                      onClick={() => copyText(combinedDraft.subject, "subject")}
                    >
                      {copiedSubject ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      {copiedSubject ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div
                    className="rounded-lg px-3 py-2 text-sm font-medium border"
                    style={{ background: "#f8f9fc", borderColor: "#e2e5ed" }}
                  >
                    {combinedDraft.subject}
                  </div>
                </div>

                {/* Email body */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Body</label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1.5 px-2"
                      onClick={() => copyText(combinedDraft.body, "body")}
                    >
                      {copiedBody ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      {copiedBody ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <textarea
                    readOnly
                    value={combinedDraft.body}
                    rows={20}
                    className="w-full rounded-lg px-3 py-2.5 text-xs font-mono border resize-none focus:outline-none"
                    style={{ background: "#f8f9fc", borderColor: "#e2e5ed", lineHeight: "1.6" }}
                    onClick={e => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>
            ) : null}
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
                month: "short", day: "numeric", year: "numeric"
              });
              return (
                <Card
                  key={review.id}
                  data-testid={`card-review-${review.id}`}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${isBatchItem ? "ring-1" : ""}`}
                  style={isBatchItem ? { ringColor: "var(--color-navy)" } : {}}
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
                          {review.gapCount} gap{review.gapCount === 1 ? "" : "s"}
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
