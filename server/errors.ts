import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  messageAr: string;
  messageFr: string;
  fieldErrors?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    messageAr: string,
    messageFr: string,
    fieldErrors?: Record<string, string>
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
    this.messageFr = messageFr;
    this.fieldErrors = fieldErrors;
  }
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        messageAr: error.messageAr,
        messageFr: error.messageFr,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
      }
    });
    return;
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "body";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    res.status(400).json({
      error: {
        code: "validation_error",
        messageAr: "تحقق من الحقول المدخلة.",
        messageFr: "Vérifiez les champs saisis.",
        fieldErrors
      }
    });
    return;
  }
  console.error("[fieldguard] unhandled error", error);
  res.status(500).json({
    error: {
      code: "internal_error",
      messageAr: "حدث خطأ غير متوقع. حاول مرة أخرى.",
      messageFr: "Une erreur inattendue est survenue. Réessayez."
    }
  });
}
