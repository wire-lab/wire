/**
 * Formats an error object into a plain object with specific properties.
 * It extracts `message`, `stack` (formatted), and `cause` (recursively).
 *
 * @param error - The error to format. Can be any unknown value.
 * @returns A plain object representing the error, or the original value if it wasn't an Error instance.
 */
export function format_error(error: unknown): unknown {
  if (error instanceof Error) {
    const output: Record<string, unknown> = { ...error };
    output._class = error.constructor.name;
    output._message = error.message;
    output._stack = format_error_stack(error.stack);
    if (error.cause) {
      output._cause = format_error(error.cause);
    }
    return output;
  }

  return error;
}

/**
 * Parses an error stack trace string into an array of strings.
 * Removes the first line (error message) and trims the stack lines.
 *
 * @param stack - The raw stack string from an Error object.
 * @returns An array of stack lines, or undefined if the stack was undefined.
 */
export const format_error_stack = (stack: undefined | string): string[] | undefined => {
  if (stack === undefined) return undefined;
  const lines = stack.split('\n    at ').values();
  lines.next(); // skip first line as it's the error message
  return [...lines];
};
