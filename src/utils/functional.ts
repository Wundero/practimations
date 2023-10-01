export function debounce<TFunction extends (...args: never[]) => void>(
  fn: TFunction,
  delay: number,
): TFunction {
  let timeout: NodeJS.Timeout | null = null;
  const out = (...args: unknown[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...(args as never[]));
    }, delay);
  };
  return out as unknown as TFunction;
}
