import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Mail, FileText, ChevronRight, Inbox, AlertTriangle } from "lucide-react";
import type { Review } from "@shared/schema";

export default function History() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const batchParam = params.get("batch");
  const clientParam = params.get("client");

  // If coming from a multi-form batch submission, highlight those IDs
  const batchIds = batchParam ? batchParam.split(",").map(Number) : null;

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews"],
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
            className="mb-6 p-4 rounded-xl border flex items-start gap-3"
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
