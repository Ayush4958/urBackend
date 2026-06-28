export const logger = {
  success(message: string): void {
    console.log(`✓ ${message}`);
  },

  error(message: string): void {
    console.error(`✖ ${message}`);
  },

  warn(message: string): void {
    console.warn(`⚠ ${message}`);
  },

  info(message: string): void {
    console.log(message);
  },
};
