import { Request, Response, NextFunction } from "express";
import type { AiProviderConnection } from "@prisma/client";
import aiProviderConnectionService from "../services/ai-provider-connection.service";
import { paramString } from "../utils/http-params";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      aiProviderConnection?: AiProviderConnection;
    }
  }
}

/** Machine authentication for centrally managed, organization-level telemetry. */
export async function requireProviderConnectionToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.header("x-qualimetrix-connection-token");
    if (!token)
      return res
        .status(401)
        .json({ success: false, error: "Missing x-qualimetrix-connection-token header" });

    const connection = await aiProviderConnectionService.resolveTelemetryConnection(
      paramString(req.params.connectionId),
      token,
    );
    if (!connection)
      return res.status(401).json({ success: false, error: "Invalid or revoked connection token" });

    req.aiProviderConnection = connection;
    next();
  } catch (error) {
    console.error("Provider telemetry authentication failed:", error);
    res.status(500).json({ success: false, error: "Telemetry authentication check failed" });
  }
}
