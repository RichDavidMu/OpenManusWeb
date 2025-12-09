export type PropertiesOnly<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

export type PartialSome<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredSome<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
