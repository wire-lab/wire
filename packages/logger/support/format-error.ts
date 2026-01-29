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

export const format_error_stack = (stack: undefined | string): string[] | undefined => {
  if (stack === undefined) return undefined;
  const lines = stack.split('\n    at ').values();
  lines.next(); // skip first line as it's the error message
  return [...lines];
};
