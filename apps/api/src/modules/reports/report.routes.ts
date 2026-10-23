import { Router } from "express";
import { z } from "zod";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { resolveCase } from "../../services/access.service.js";
import { param } from "../../lib/request.js";
import { buildBgvReport } from "./report.service.js";

export const reportRouter = Router();

const caseParams = z.object({ caseId: z.string().uuid() });

/**
 * GET /api/cases/:caseId/report
 *
 * The internal BGV report. Restricted to roles holding `report:read`.
 */
reportRouter.get(
  "/cases/:caseId/report",
  requirePrincipal,
  requirePermission("report:read"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const report = await buildBgvReport(caseRow.id, {
      userId: req.principal!.userId,
      fullName: req.principal!.fullName,
      role: req.principal!.roles[0] ?? null,
    });
    res.status(200).json({ data: report });
  },
);
