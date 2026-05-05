declare module 'vdf' {
  type VdfNode = string | { [key: string]: VdfNode }
  export function parse(input: string): { [key: string]: VdfNode }
  export function dump(obj: { [key: string]: VdfNode }): string
}
