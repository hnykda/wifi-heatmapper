/**
 * Type declarations for the koffi module
 *
 * koffi is a native FFI library that only works on Windows/Linux/macOS.
 * We declare minimal types here to allow compilation on systems where
 * the module isn't installed.
 */

declare module "koffi" {
  interface KoffiLib {
    func(
      convention: string,
      name: string,
      returnType: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      argTypes: any[]
    ): (...args: unknown[]) => unknown;
  }

  interface Koffi {
    load(path: string): KoffiLib;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    struct(name: string, definition: Record<string, any>): unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    array(type: any, length: number): unknown;
    pointer(type: unknown): unknown;
    out(type: unknown): unknown;
    decode(
      buffer: unknown,
      type: unknown,
      offset?: number
    ): Record<string, unknown>;
  }

  const koffi: Koffi;
  export default koffi;
}
