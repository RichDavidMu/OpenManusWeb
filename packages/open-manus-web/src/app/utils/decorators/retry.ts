export function retry({
  stop = 1,
  wait = 60,
  retry = () => true,
}: {
  stop?: number;
  wait?: number;
  retry?: (error: any) => boolean;
}) {
  return function (_target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let attempts = 0;
      let lastError: any;

      while (attempts < stop) {
        try {
          return await originalMethod.apply(this, args);
        } catch (e) {
          lastError = e;
          attempts++;
          if (attempts >= stop || !retry(e)) {
            throw lastError;
          }
          console.log(`Retry ${propertyName} ${attempts}/${stop} after ${wait / 1000} s`);
          if (wait > 0) {
            await new Promise((r) => setTimeout(r, wait));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}
