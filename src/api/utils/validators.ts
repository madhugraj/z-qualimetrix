/**
 * API Validation Utilities
 * Reusable validation functions for API endpoints
 */

/**
 * Validate UUID format
 * @param uuid - The UUID string to validate
 * @returns true if valid UUID format, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validation error response helper
 * @param res - Express response object
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 400)
 */
export function validationErrorResponse(res: any, message: string = 'Invalid UUID format', statusCode: number = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
}