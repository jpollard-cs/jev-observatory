export const fileURLToPath = (value) => decodeURIComponent(new URL(value).pathname);
export const pathToFileURL = (value) => new URL('file://' + value);
