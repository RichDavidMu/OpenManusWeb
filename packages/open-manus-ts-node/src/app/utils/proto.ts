export function isInstance(obj: any, cls: Function): boolean {
  return Object.getPrototypeOf(obj) === cls.prototype;
}
