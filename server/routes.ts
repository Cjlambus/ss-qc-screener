import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { detectFormType, evaluateForm, generateEmailDraft, generateCombinedEmailDraft } from "./qc-engine";
import { extractTextFromPDF } from "./pdf-ocr";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Upload and QC a PDF
  app.post("/api/review", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const { clientName, clientEmail } = req.body;
      if (!clientName || !clientEmail) {
        return res.status(400).json({ error: "Client name and email are required" });
      }

      // Parse PDF (supports both text-based and image/scanned PDFs via OCR)
      let text = "";
      try {
        text = await extractTextFromPDF(req.file.buffer);
      } catch (e: any) {
        console.error('PDF extraction error:', e.message);
        return res.status(422).json({ error: "Could not read this PDF. Please ensure it is a valid PDF file." });
      }

      if (!text || text.trim().length < 50) {
        return res.status(422).json({ error: "The PDF appears to be empty or unreadable. Please try a different file." });
      }

      // Detect form type
      const formType = detectFormType(text);

      // Run QC
      const qcResult = evaluateForm(text, formType);

      // Generate email draft
      const emailDraft = qcResult.gaps.length > 0
        ? generateEmailDraft(clientName, formType, qcResult.gaps)
        : { subject: "", body: "" };

      // Store review
      const review = storage.createReview({
        clientName,
        clientEmail,
        formType,
        fileName: req.file.originalname,
        reviewDate: new Date().toISOString(),
        status: qcResult.status,
        gapCount: qcResult.gaps.length,
        gapsJson: JSON.stringify(qcResult.gaps),
        emailDraftJson: JSON.stringify(emailDraft),
        emailSent: false,
        emailSentDate: null,
        notes: null,
      });

      res.json({ review, qcResult, emailDraft });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error during QC review" });
    }
  });

  // Get all reviews
  app.get("/api/reviews", (_req, res) => {
    try {
      const reviews = storage.getReviews();
      res.json(reviews);
    } catch (err) {
      res.status(500).json({ error: "Failed to load reviews" });
    }
  });

  // Get single review
  app.get("/api/reviews/:id", (req, res) => {
    try {
      const review = storage.getReview(Number(req.params.id));
      if (!review) return res.status(404).json({ error: "Review not found" });
      res.json(review);
    } catch (err) {
      res.status(500).json({ error: "Failed to load review" });
    }
  });

  // Send email (mark as sent — actual email sending via external tools not available in webapp)
  app.post("/api/reviews/:id/send-email", (req, res) => {
    try {
      const review = storage.getReview(Number(req.params.id));
      if (!review) return res.status(404).json({ error: "Review not found" });
      const updated = storage.updateEmailSent(Number(req.params.id), new Date().toISOString());
      res.json({ success: true, review: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update email status" });
    }
  });

  // Combined email draft for a batch of reviews (multiple forms, one email)
  app.post("/api/batch-email", (req, res) => {
    try {
      const { reviewIds } = req.body as { reviewIds: number[] };
      if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
        return res.status(400).json({ error: "reviewIds array required" });
      }
      const reviews = reviewIds.map(id => storage.getReview(id)).filter(Boolean) as any[];
      if (reviews.length === 0) return res.status(404).json({ error: "No reviews found" });

      const clientName = reviews[0].clientName;
      const forms = reviews.map((r: any) => ({
        formType: r.formType,
        gaps: JSON.parse(r.gapsJson || "[]"),
      }));

      const draft = generateCombinedEmailDraft(clientName, forms);
      res.json(draft);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate combined email" });
    }
  });

  return httpServer;
}
